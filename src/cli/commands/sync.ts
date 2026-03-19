/**
 * openskulls sync — update context after code changes.
 *
 * Interactive mode:
 *  1. Load fingerprint baseline
 *  2. Re-analyse repo
 *  3. Detect drift → if none, exit early
 *  3b-3e. Generate skills, architect skill, methodology, guardrails
 *  4. Workspace loading + fingerprinting (if configured)
 *  5. Generate files (root + per-workspace)
 *  6. Show plan + confirm
 *  7. Write files + save fingerprint + per-workspace fingerprints
 *
 * Hook mode (--hook --changed <files>):
 *  1. Check trigger patterns — skip if no relevant file changed
 *  2. Load baseline — skip silently if missing
 *  3. Analyse + drift check → skip if no drift
 *  4. Write files silently (root + per-workspace)
 *  Always exits 0.
 */

import { confirm, isCancel, cancel } from '@clack/prompts'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Command } from 'commander'
import { AIFingerprintCollector, type VerboseLogger } from '../../core/fingerprint/ai-collector.js'
import { loadFingerprint, saveFingerprint } from '../../core/fingerprint/cache.js'
import { hasDrifted } from '../../core/fingerprint/types.js'
import { generateAISkills, type AISkill } from '../../core/fingerprint/skills-builder.js'
import { generateMethodologySkills } from '../../core/fingerprint/methodology-builder.js'
import { loadInstalledPacks } from '../../core/packages/loader.js'
import { generateArchitectSkill } from '../../core/fingerprint/architect-builder.js'
import { generateArchitectGuardrails, isComplexProject, type ArchitectGuardrails } from '../../core/fingerprint/guardrails-builder.js'
import { resolveFilePath, type GeneratedFile, type WorkspaceMapEntry } from '../../core/generators/base.js'
import { selectGenerators } from '../../core/generators/registry.js'
import { defaultProjectConfig, defaultGlobalConfig, loadWorkflowConfig, loadWorkspaceConfig, loadEnabledTargets } from '../../core/config/types.js'
import {
  divider, fatal, fileList, heading, log, spinner, verboseBlock,
} from '../ui/console.js'
import { writeGeneratedFile } from './shared.js'
import { shouldTriggerSync } from './hook.js'
import { discoverWorkspaces } from '../../core/fingerprint/workspace-discovery.js'
import { collectWorkspaceFingerprints, buildAggregateFingerprint, toWorkspaceMapEntries } from '../../core/fingerprint/workspace-collector.js'
import { loadAllWorkspaceFingerprints, saveWorkspaceFingerprint } from '../../core/fingerprint/workspace-cache.js'
import { scanForeignFiles } from '../../core/fingerprint/foreign-file-detector.js'
import type { WorkspaceFingerprint } from '../../core/fingerprint/workspace-types.js'

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TRIGGER_PATTERNS = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'requirements*.txt',
  'pyproject.toml',
  'Pipfile',
  'Pipfile.lock',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'Gemfile.lock',
  'tsconfig*.json',
  '.github/workflows/**',
]

// ─── Command ──────────────────────────────────────────────────────────────────

export function registerSync(program: Command): void {
  program
    .command('sync [path]')
    .description('Update AI context files after code changes')
    .option('-n, --dry-run', 'Show what would be generated without writing files')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('-v, --verbose', 'Print AI prompts and raw responses')
    .option('--hook', 'Running from a git hook — suppress interactive output', false)
    .option('--changed <files>', 'Newline-separated changed files (from hook)')
    .action(async (
      path: string = '.',
      options: { dryRun?: boolean; yes?: boolean; verbose?: boolean; hook?: boolean; changed?: string },
    ) => {
      if (options.hook) {
        await hookMode(path, options.changed ?? '')
      } else {
        await interactiveMode(path, options)
      }
    })
}

/** Targets that emit .claude/skills/ files — used to skip unnecessary AI calls. */
const SKILL_TARGETS = new Set(['claude_code', 'codex'])

// ─── Interactive mode ─────────────────────────────────────────────────────────

async function interactiveMode(
  path: string,
  options: { dryRun?: boolean; yes?: boolean; verbose?: boolean },
): Promise<void> {
  const repoRoot = resolve(path)

  // ── Step 1: Load baseline + workflow config ──────────────────────────────

  const baseline = await loadFingerprint(repoRoot)
  if (!baseline) {
    fatal('No fingerprint found — run `openskulls init` first.')
  }

  const workflowConfig = await loadWorkflowConfig(repoRoot)
  const enabledTargets = await loadEnabledTargets(repoRoot)
  const needsSkills = [...enabledTargets].some((id) => SKILL_TARGETS.has(id))

  // Load workspace config and per-workspace baselines
  const wsConfig = await loadWorkspaceConfig(repoRoot)
  const wsEntries = wsConfig ? await discoverWorkspaces(repoRoot, wsConfig) : []
  const wsBaselines = wsEntries.length > 0
    ? await loadAllWorkspaceFingerprints(repoRoot, wsEntries.map((e) => e.path))
    : new Map()

  // ── Step 2: Analyse ──────────────────────────────────────────────────────

  const spin = spinner('Analysing repository…').start()

  let fingerprint
  const analysisCapture = { prompt: '', response: '' }
  try {
    const collector = new AIFingerprintCollector()
    const analysisLogger: VerboseLogger = {
      onPrompt:   (p) => { analysisCapture.prompt = p },
      onResponse: (r) => { analysisCapture.response = r },
    }
    fingerprint = await collector.collect(repoRoot, undefined, analysisLogger)
    spin.succeed('Repository analysed')
  } catch (err) {
    spin.fail('Analysis failed')

    const errorMsg = err instanceof Error ? err.message : String(err)
    const logContent = [
      `openskulls sync — analysis error`,
      `Date: ${new Date().toISOString()}`,
      `Error: ${errorMsg}`,
      '',
      '── Prompt ──',
      analysisCapture.prompt || '(not captured)',
      '',
      '── Raw response ──',
      analysisCapture.response || '(empty)',
    ].join('\n')
    const logDir = join(repoRoot, '.openskulls')
    const logPath = join(logDir, 'last-error.log')
    try {
      await mkdir(logDir, { recursive: true })
      await writeFile(logPath, logContent, 'utf-8')
      log.warn(`Diagnostic log written to .openskulls/last-error.log`)
    } catch {
      // best-effort
    }

    fatal(
      `Could not analyse ${repoRoot}`,
      errorMsg,
    )
  }
  if (options.verbose) {
    verboseBlock('Analysis prompt', analysisCapture.prompt)
    verboseBlock('Analysis response', analysisCapture.response)
  }

  // ── Step 3: Drift check ──────────────────────────────────────────────────

  const rootDrifted = hasDrifted(fingerprint, baseline)

  // Check workspace drift too
  const anyWsDrift = wsBaselines.size > 0 && [...wsBaselines.values()].some((b) => b === null)

  if (!rootDrifted && !anyWsDrift) {
    log.success('Context is up to date.')
    process.exit(0)
  }

  // ── Step 3b: Generate AI skills ──────────────────────────────────────────

  let aiSkills: AISkill[] = []
  const skillsCapture = { prompt: '', response: '' }

  if (!needsSkills) {
    log.info('Skipping skills generation — enabled targets do not use skills')
  } else {
    const skillsSpin = spinner('Generating project skills…').start()
    try {
      const skillsLogger: VerboseLogger = {
        onPrompt:   (p) => { skillsCapture.prompt = p },
        onResponse: (r) => { skillsCapture.response = r },
      }
      aiSkills = await generateAISkills(fingerprint, skillsLogger)
      skillsSpin.succeed(`Generated ${aiSkills.length} project skills`)
    } catch (err) {
      skillsSpin.warn('Could not generate skills — skipping')
      log.info(err instanceof Error ? err.message : String(err))
      // Non-fatal: sync continues without skills
    }
    if (options.verbose) {
      verboseBlock('Skills prompt', skillsCapture.prompt)
      verboseBlock('Skills response', skillsCapture.response)
    }

    // ── Step 3c: Architect skill (if enabled) ──────────────────────────────

    if (workflowConfig.architectEnabled) {
      const archSpin = spinner('Regenerating architect skill…').start()
      const archCapture = { prompt: '', response: '' }
      try {
        const archLogger: VerboseLogger = {
          onPrompt:   (p) => { archCapture.prompt = p },
          onResponse: (r) => { archCapture.response = r },
        }
        const architectSkill = await generateArchitectSkill(fingerprint, workflowConfig, archLogger)
        aiSkills = [architectSkill, ...aiSkills]
        archSpin.succeed('Regenerated architect skill')
      } catch (err) {
        archSpin.warn('Could not regenerate architect skill — skipping')
        log.info(err instanceof Error ? err.message : String(err))
      }
      if (options.verbose) {
        verboseBlock('Architect prompt', archCapture.prompt)
        verboseBlock('Architect response', archCapture.response)
      }
    }

    // ── Step 3d: Methodology skills ────────────────────────────────────────

    const methSpin = spinner('Generating methodology skills…').start()
    const methCapture = { prompt: '', response: '' }
    try {
      const methLogger: VerboseLogger = {
        onPrompt:   (p) => { methCapture.prompt = p },
        onResponse: (r) => { methCapture.response = r },
      }
      const taskIds = aiSkills.map((s) => s.id)
      const methSkills = await generateMethodologySkills(fingerprint, methLogger, undefined, [], taskIds)
      aiSkills = [...aiSkills, ...methSkills]
      methSpin.succeed(`Generated ${methSkills.length} methodology skills`)
    } catch (err) {
      methSpin.warn('Could not generate methodology skills — skipping')
      log.info(err instanceof Error ? err.message : String(err))
    }
    if (options.verbose) {
      verboseBlock('Methodology prompt', methCapture.prompt)
      verboseBlock('Methodology response', methCapture.response)
    }
  }

  // ── Step 3e: Architect guardrails (complex projects only) ────────────────

  let architectGuardrails: ArchitectGuardrails | undefined
  let workspaces: WorkspaceFingerprint[] = []
  let workspaceMap: WorkspaceMapEntry[] | undefined

  // ── Step 4: Workspace fingerprinting (if configured) ─────────────────────

  if (wsEntries.length > 0) {
    const wsSpin = spinner(`Analysing ${wsEntries.length} workspace(s)…`).start()
    try {
      const { results, errors } = await collectWorkspaceFingerprints(
        repoRoot,
        wsEntries,
        // sync has no adapter, use default detection
        await (async () => {
          const { detectAICLI } = await import('../../core/fingerprint/ai-collector.js')
          return detectAICLI()
        })(),
        { useParallel: workflowConfig.useSubagents },
      )
      workspaces = results
      if (errors.size > 0) {
        for (const [wsPath, msg] of errors) {
          log.warn(`  ${wsPath}: ${msg}`)
        }
      }
      wsSpin.succeed(`Analysed ${workspaces.length} workspace(s)`)

      if (workspaces.length > 0) {
        fingerprint = buildAggregateFingerprint(repoRoot, workspaces, fingerprint.description)
        workspaceMap = toWorkspaceMapEntries(workspaces)
      }
    } catch (err) {
      wsSpin.warn('Workspace analysis failed — using root fingerprint only')
      log.info(err instanceof Error ? err.message : String(err))
    }
  }

  if (isComplexProject(fingerprint)) {
    const guardrailsSpin = spinner('Generating architectural guardrails…').start()
    const guardrailsCapture = { prompt: '', response: '' }
    try {
      const guardrailsLogger: VerboseLogger = {
        onPrompt:   (p) => { guardrailsCapture.prompt = p },
        onResponse: (r) => { guardrailsCapture.response = r },
      }
      architectGuardrails = await generateArchitectGuardrails(fingerprint, guardrailsLogger, undefined, workspaceMap)
      guardrailsSpin.succeed('Generated architectural guardrails')
    } catch (err) {
      guardrailsSpin.warn('Could not generate guardrails — skipping')
      log.info(err instanceof Error ? err.message : String(err))
    }
    if (options.verbose) {
      verboseBlock('Guardrails prompt', guardrailsCapture.prompt)
      verboseBlock('Guardrails response', guardrailsCapture.response)
    }
  }

  // ── Step 5: Generate files ───────────────────────────────────────────────

  const projectConfig = defaultProjectConfig()
  const globalConfig  = defaultGlobalConfig()

  // TODO(v1.1): git pull on installed packs during sync
  const installedPacks = await loadInstalledPacks(repoRoot)

  // Scan for foreign skills at root
  const foreignScan = await scanForeignFiles(repoRoot)

  const generatorInput = {
    fingerprint,
    installedPackages: installedPacks,
    projectConfig,
    globalConfig,
    aiSkills,
    workflowConfig,
    architectGuardrails,
    workspaceMap: workspaceMap ?? undefined,
    foreignSkills: foreignScan.foreignSkills.length > 0 ? foreignScan.foreignSkills : undefined,
  }

  const activeTools = new Set([...enabledTargets, ...fingerprint.aiCLIs.map((a) => a.tool)])
  const generatedFiles: GeneratedFile[] = selectGenerators(activeTools)
    .flatMap((g) => g.generate(generatorInput))

  const homeDir = homedir()

  // Build combined plan (root + per-workspace)
  const allGeneratedFiles: Array<{ file: GeneratedFile; absPath: string; action: 'create' | 'update'; workspaceLabel?: string }> = []

  for (const f of generatedFiles) {
    const absPath = resolveFilePath(f, repoRoot, homeDir)
    const action: 'create' | 'update' = existsSync(absPath) ? 'update' : 'create'
    allGeneratedFiles.push({ file: f, absPath, action })
  }

  for (const ws of workspaces) {
    const wsRoot = join(repoRoot, ws.path)
    const wsForeignScan = await scanForeignFiles(wsRoot)
    const wsGeneratorInput = {
      fingerprint: ws.fingerprint,
      installedPackages: installedPacks,
      projectConfig,
      globalConfig,
      aiSkills: [],
      workflowConfig,
      foreignSkills: wsForeignScan.foreignSkills.length > 0 ? wsForeignScan.foreignSkills : undefined,
    }
    const wsFiles = selectGenerators(activeTools).flatMap((g) => g.generate(wsGeneratorInput))
    for (const f of wsFiles) {
      const absPath = resolveFilePath(f, wsRoot, homeDir)
      const action: 'create' | 'update' = existsSync(absPath) ? 'update' : 'create'
      allGeneratedFiles.push({ file: f, absPath, action, workspaceLabel: ws.name })
    }
  }

  // ── Step 6: Show plan ────────────────────────────────────────────────────

  log.blank()
  heading('Generation plan')

  fileList(allGeneratedFiles.map((p) => ({
    path: p.workspaceLabel ? `[${p.workspaceLabel}] ${p.absPath}` : p.absPath,
    action: p.action,
  })))
  log.blank()

  if (options.dryRun) {
    log.info('Dry run — no files written.')
    process.exit(0)
  }

  if (!options.yes) {
    const go = await confirm({ message: 'Update these files?' })
    if (isCancel(go) || go === false) { cancel('Aborted.'); process.exit(0) }
  }

  // ── Step 7: Write + save ─────────────────────────────────────────────────

  log.blank()
  for (const { file, absPath, action } of allGeneratedFiles) {
    await writeGeneratedFile(file, absPath)
    log.success(`${action === 'create' ? 'Created' : 'Updated'} ${absPath}`)
  }

  await saveFingerprint(repoRoot, fingerprint)

  for (const ws of workspaces) {
    await saveWorkspaceFingerprint(repoRoot, ws.path, ws.fingerprint)
  }

  log.blank()
  divider()
  log.success('Context updated.')
}

// ─── Hook mode ────────────────────────────────────────────────────────────────

async function hookMode(path: string, changedRaw: string): Promise<void> {
  // Always exit 0 — this is a post-commit hook, never block the user.
  try {
    const repoRoot = resolve(path)

    // Fast path: skip if no trigger-pattern file changed
    const changedFiles = changedRaw.split('\n').map((s) => s.trim()).filter(Boolean)
    if (changedFiles.length > 0 && !shouldTriggerSync(changedFiles, DEFAULT_TRIGGER_PATTERNS)) {
      process.exit(0)
    }

    // Load baseline — skip silently if init hasn't been run yet
    const baseline = await loadFingerprint(repoRoot)
    if (!baseline) {
      process.exit(0)
    }

    const workflowConfig = await loadWorkflowConfig(repoRoot)
    const hookTargets = await loadEnabledTargets(repoRoot)
    const hookNeedsSkills = [...hookTargets].some((id) => SKILL_TARGETS.has(id))

    // Load workspace config
    const wsConfig = await loadWorkspaceConfig(repoRoot)
    const wsEntries = wsConfig ? await discoverWorkspaces(repoRoot, wsConfig) : []

    // Analyse
    const collector = new AIFingerprintCollector()
    let fingerprint = await collector.collect(repoRoot)

    // Drift check
    if (!hasDrifted(fingerprint, baseline)) {
      process.exit(0)
    }

    // Generate AI skills (non-fatal, only if targets need them)
    let aiSkills: AISkill[] = []
    if (hookNeedsSkills) {
      try {
        aiSkills = await generateAISkills(fingerprint)
      } catch {
        // Skip silently in hook mode
      }

      // Architect skill (non-fatal)
      if (workflowConfig.architectEnabled) {
        try {
          const architectSkill = await generateArchitectSkill(fingerprint, workflowConfig)
          aiSkills = [architectSkill, ...aiSkills]
        } catch {
          // Skip silently in hook mode
        }
      }

      // Methodology skills (non-fatal)
      try {
        const taskIds = aiSkills.map((s) => s.id)
        const methSkills = await generateMethodologySkills(fingerprint, undefined, undefined, [], taskIds)
        aiSkills = [...aiSkills, ...methSkills]
      } catch {
        // Skip silently in hook mode
      }
    }

    // Workspace fingerprinting (non-fatal)
    let workspaces: WorkspaceFingerprint[] = []
    let workspaceMap: WorkspaceMapEntry[] | undefined

    if (wsEntries.length > 0) {
      try {
        const { detectAICLI } = await import('../../core/fingerprint/ai-collector.js')
        const adapter = await detectAICLI()
        const { results } = await collectWorkspaceFingerprints(repoRoot, wsEntries, adapter, { useParallel: workflowConfig.useSubagents })
        workspaces = results
        if (workspaces.length > 0) {
          fingerprint = buildAggregateFingerprint(repoRoot, workspaces, fingerprint.description)
          workspaceMap = toWorkspaceMapEntries(workspaces)
        }
      } catch {
        // Skip silently in hook mode
      }
    }

    // Architect guardrails (non-fatal)
    let architectGuardrails: ArchitectGuardrails | undefined
    if (isComplexProject(fingerprint)) {
      try {
        architectGuardrails = await generateArchitectGuardrails(fingerprint, undefined, undefined, workspaceMap)
      } catch {
        // Skip silently in hook mode
      }
    }

    // Scan for foreign skills (non-fatal)
    let foreignSkills: string[] | undefined
    try {
      const foreignScan = await scanForeignFiles(repoRoot)
      if (foreignScan.foreignSkills.length > 0) foreignSkills = foreignScan.foreignSkills
    } catch {
      // Skip silently in hook mode
    }

    // Generate + write silently
    const projectConfig = defaultProjectConfig()
    const globalConfig  = defaultGlobalConfig()
    // TODO(v1.1): git pull on installed packs during sync
    const installedPacks = await loadInstalledPacks(repoRoot)
    const generatorInput = {
      fingerprint,
      installedPackages: installedPacks,
      projectConfig,
      globalConfig,
      aiSkills,
      workflowConfig,
      architectGuardrails,
      workspaceMap: workspaceMap ?? undefined,
      foreignSkills,
    }
    const activeTools = new Set([...hookTargets, ...fingerprint.aiCLIs.map((a) => a.tool)])
    const generatedFiles: GeneratedFile[] = selectGenerators(activeTools)
      .flatMap((g) => g.generate(generatorInput))

    const homeDir = homedir()
    for (const file of generatedFiles) {
      const absPath = resolveFilePath(file, repoRoot, homeDir)
      await writeGeneratedFile(file, absPath)
    }

    // Per-workspace files
    for (const ws of workspaces) {
      const wsRoot = join(repoRoot, ws.path)
      let wsForeignSkills: string[] | undefined
      try {
        const wsForeignScan = await scanForeignFiles(wsRoot)
        if (wsForeignScan.foreignSkills.length > 0) wsForeignSkills = wsForeignScan.foreignSkills
      } catch {
        // Skip silently
      }
      const wsGeneratorInput = {
        fingerprint: ws.fingerprint,
        installedPackages: installedPacks,
        projectConfig,
        globalConfig,
        aiSkills: [],
        workflowConfig,
        foreignSkills: wsForeignSkills,
      }
      const wsFiles = selectGenerators(activeTools).flatMap((g) => g.generate(wsGeneratorInput))
      for (const file of wsFiles) {
        const absPath = resolveFilePath(file, wsRoot, homeDir)
        await writeGeneratedFile(file, absPath)
      }
      await saveWorkspaceFingerprint(repoRoot, ws.path, ws.fingerprint)
    }

    await saveFingerprint(repoRoot, fingerprint)
  } catch {
    // Hook mode must never fail visibly or block commits
  }

  process.exit(0)
}

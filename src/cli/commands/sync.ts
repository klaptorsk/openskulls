/**
 * openskulls sync — update context after code changes.
 *
 * Interactive mode:
 *  1. Load fingerprint baseline
 *  2. Re-analyse repo
 *  3. Detect drift → if none, exit early
 *  4. Generate updated files
 *  5. Show plan + confirm
 *  6. Write files + save fingerprint
 *
 * Hook mode (--hook --changed <files>):
 *  1. Check trigger patterns — skip if no relevant file changed
 *  2. Load baseline — skip silently if missing
 *  3. Analyse + drift check → skip if no drift
 *  4. Write files silently
 *  Always exits 0.
 */

import { confirm, isCancel, cancel } from '@clack/prompts'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { AIFingerprintCollector, type VerboseLogger } from '../../core/fingerprint/ai-collector.js'
import { loadFingerprint, saveFingerprint } from '../../core/fingerprint/cache.js'
import { hasDrifted } from '../../core/fingerprint/types.js'
import { generateAISkills, type AISkill } from '../../core/fingerprint/skills-builder.js'
import { generateArchitectSkill } from '../../core/fingerprint/architect-builder.js'
import { resolveFilePath, type GeneratedFile } from '../../core/generators/base.js'
import { selectGenerators } from '../../core/generators/registry.js'
import { defaultProjectConfig, defaultGlobalConfig, loadWorkflowConfig } from '../../core/config/types.js'
import {
  divider, fatal, fileList, heading, log, spinner, verboseBlock,
} from '../ui/console.js'
import { writeGeneratedFile } from './shared.js'
import { shouldTriggerSync } from './hook.js'

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
    fatal(
      `Could not analyse ${repoRoot}`,
      err instanceof Error ? err.message : String(err),
    )
  }
  if (options.verbose) {
    verboseBlock('Analysis prompt', analysisCapture.prompt)
    verboseBlock('Analysis response', analysisCapture.response)
  }

  // ── Step 3: Drift check ──────────────────────────────────────────────────

  if (!hasDrifted(fingerprint, baseline)) {
    log.success('Context is up to date.')
    process.exit(0)
  }

  // ── Step 3b: Generate AI skills ──────────────────────────────────────────

  const skillsSpin = spinner('Generating project skills…').start()
  let aiSkills: AISkill[] = []
  const skillsCapture = { prompt: '', response: '' }
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

  // ── Step 3c: Architect skill (if enabled) ────────────────────────────────

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

  // ── Step 4: Generate files ───────────────────────────────────────────────

  const projectConfig = defaultProjectConfig()
  const globalConfig  = defaultGlobalConfig()

  const generatorInput = {
    fingerprint,
    installedPackages: [],
    projectConfig,
    globalConfig,
    aiSkills,
    workflowConfig,
  }

  const activeTools = new Set(['claude_code', ...fingerprint.aiCLIs.map((a) => a.tool)])
  const generatedFiles: GeneratedFile[] = selectGenerators(activeTools)
    .flatMap((g) => g.generate(generatorInput))

  // ── Step 5: Show plan ────────────────────────────────────────────────────

  log.blank()
  heading('Generation plan')

  const homeDir = homedir()
  const plan = generatedFiles.map((f) => {
    const absPath = resolveFilePath(f, repoRoot, homeDir)
    const action: 'create' | 'update' = existsSync(absPath) ? 'update' : 'create'
    return { file: f, absPath, action }
  })

  fileList(plan.map((p) => ({ path: p.absPath, action: p.action })))
  log.blank()

  if (options.dryRun) {
    log.info('Dry run — no files written.')
    process.exit(0)
  }

  if (!options.yes) {
    const go = await confirm({ message: 'Update these files?' })
    if (isCancel(go) || go === false) { cancel('Aborted.'); process.exit(0) }
  }

  // ── Step 6: Write + save ─────────────────────────────────────────────────

  log.blank()
  for (const { file, absPath, action } of plan) {
    await writeGeneratedFile(file, absPath)
    log.success(`${action === 'create' ? 'Created' : 'Updated'} ${absPath}`)
  }

  await saveFingerprint(repoRoot, fingerprint)

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

    // Analyse
    const collector = new AIFingerprintCollector()
    const fingerprint = await collector.collect(repoRoot)

    // Drift check
    if (!hasDrifted(fingerprint, baseline)) {
      process.exit(0)
    }

    // Generate AI skills (non-fatal)
    let aiSkills: AISkill[] = []
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

    // Generate + write silently
    const projectConfig = defaultProjectConfig()
    const globalConfig  = defaultGlobalConfig()
    const generatorInput = { fingerprint, installedPackages: [], projectConfig, globalConfig, aiSkills, workflowConfig }
    const activeTools = new Set(['claude_code', ...fingerprint.aiCLIs.map((a) => a.tool)])
    const generatedFiles: GeneratedFile[] = selectGenerators(activeTools)
      .flatMap((g) => g.generate(generatorInput))

    const homeDir = homedir()
    for (const file of generatedFiles) {
      const absPath = resolveFilePath(file, repoRoot, homeDir)
      await writeGeneratedFile(file, absPath)
    }

    await saveFingerprint(repoRoot, fingerprint)
  } catch {
    // Hook mode must never fail visibly or block commits
  }

  process.exit(0)
}

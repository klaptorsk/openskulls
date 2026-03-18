/**
 * openskulls init — first-time setup for a repository.
 *
 * Flow:
 *  1. Analyse repo with AIFingerprintCollector
 *  2. Show detected signals
 *  3. Generate AI questionnaire (repo-specific questions from fingerprint)
 *  4. Run interviewer (static workflow Qs + dynamic AI Qs)
 *  5. Generate AI skills (with user answers)
 *  6. Generate architect skill if enabled (with user answers)
 *  7. Run generators → GeneratedFile[]
 *  8. Show generation plan (what will be written)
 *  9. Confirm (skip with --yes)
 * 10. Write files (merge_sections for CLAUDE.md, replace otherwise)
 * 11. Save fingerprint.json and config.toml (includes qa answers)
 * 12. Install git hook
 */

import { intro, outro, confirm, isCancel, cancel } from '@clack/prompts'
import { circleMultiselect } from '../ui/prompts.js'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { stringify as tomlStringify } from 'smol-toml'
import chalk from 'chalk'
import type { Command } from 'commander'
import { AIFingerprintCollector, detectAICLIFor, type AICLIAdapter, type VerboseLogger } from '../../core/fingerprint/ai-collector.js'
import { saveFingerprint } from '../../core/fingerprint/cache.js'
import { generateAISkills, type AISkill } from '../../core/fingerprint/skills-builder.js'
import { generateMethodologySkills } from '../../core/fingerprint/methodology-builder.js'
import { loadInstalledPacks } from '../../core/packages/loader.js'
import { generateArchitectSkill } from '../../core/fingerprint/architect-builder.js'
import { generateQuestionnaire, type AIQuestion } from '../../core/fingerprint/questionnaire-builder.js'
import { resolveFilePath, type GeneratedFile } from '../../core/generators/base.js'
import { selectGenerators } from '../../core/generators/registry.js'
import { defaultProjectConfig, defaultGlobalConfig } from '../../core/config/types.js'
import {
  printBanner, divider, fatal, fileList, heading, log, spinner, subheading, table, verboseBlock,
} from '../ui/console.js'
import { writeGeneratedFile } from './shared.js'
import { installGitHook } from './hook.js'
import { runInterviewer } from './interviewer.js'

// ─── Command ──────────────────────────────────────────────────────────────────

export function registerInit(program: Command): void {
  program
    .command('init [path]')
    .description('Analyse a repository and generate AI context files')
    .option('-n, --dry-run', 'Show what would be generated without writing files')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('-v, --verbose', 'Print AI prompts and raw responses')
    .addHelpText('after', `
Workflow setup (interactive, skipped with --yes):
  auto-docs     Update docs after features automatically / ask / never
  auto-commit   Commit when tasks complete automatically / ask / never
  architect     Generate a domain-expert /architect-review skill for this repo
  parallel      Run skills + architect in parallel (faster, uses more AI calls)

Examples:
  $ openskulls init                      interactive setup in current directory
  $ openskulls init ./my-service         explicit path
  $ openskulls init --dry-run            preview without writing
  $ openskulls init --yes                skip all prompts, use defaults
  $ openskulls init --verbose            show AI prompts and raw responses`)
    .action(async (
      path: string = '.',
      options: { dryRun?: boolean; yes?: boolean; verbose?: boolean },
    ) => {
      const repoRoot = resolve(path)

      printBanner()
      intro(`init  ${chalk.dim(repoRoot)}`)

      // ── Step 0: Select AI engine ──────────────────────────────────────────

      const CLI_NAMES: Record<string, string> = {
        claude:  'Claude Code',
        codex:   'Codex',
        copilot: 'GitHub Copilot',
        cursor:  'Cursor',
      }

      const selectedToolIds = options.yes ? ['claude_code'] : await askAITools()

      const adapter: AICLIAdapter = await detectAICLIFor(selectedToolIds).catch((err: unknown) =>
        fatal(
          'No AI CLI found in PATH.',
          err instanceof Error ? err.message : 'Install Claude Code, Copilot, Cursor, or OpenAI Codex.',
        )
      )

      const displayName = CLI_NAMES[adapter.command] ?? adapter.command
      const versionHint = adapter.version ? ` ${adapter.version}` : ''
      log.success(`AI engine: ${displayName}${chalk.dim(`${versionHint} (${adapter.command})`)}`)

      log.blank()

      // ── Step 1: Analyse ──────────────────────────────────────────────────

      const spin = spinner('Analysing repository…').start()

      let fingerprint
      const analysisCapture = { prompt: '', response: '' }
      try {
        const collector = new AIFingerprintCollector()
        const analysisLogger: VerboseLogger = {
          onPrompt:   (p) => { analysisCapture.prompt = p },
          onResponse: (r) => { analysisCapture.response = r },
        }
        fingerprint = await collector.collect(repoRoot, undefined, analysisLogger, adapter)
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

      // ── Step 2: Show detected signals ────────────────────────────────────

      log.blank()
      heading('Detected signals')

      if (fingerprint.languages.length === 0) {
        log.warn('No languages detected. Is this an empty or unsupported repo?')
      } else {
        table(
          fingerprint.languages.map((l) => [
            l.name + (l.primary ? ' ✦' : ''),
            `${l.percentage.toFixed(0)}%`,
            l.version ? `v${l.version}` : '',
            l.confidence,
          ]),
        )
      }

      if (fingerprint.frameworks.length > 0) {
        log.blank()
        subheading('Frameworks')
        table(
          fingerprint.frameworks.map((f) => [
            f.name,
            f.category,
            f.version ? `v${f.version}` : '',
            f.confidence,
          ]),
        )
      }

      if (fingerprint.testing) {
        log.blank()
        subheading('Testing')
        table([
          [fingerprint.testing.framework, fingerprint.testing.pattern ?? '', fingerprint.testing.coverageTool ?? ''],
        ])
      }

      if (fingerprint.linting && fingerprint.linting.tools.length > 0) {
        log.blank()
        subheading('Linting')
        table(fingerprint.linting.tools.map((tool) => [tool]))
      }

      if (fingerprint.aiCLIs.length > 0) {
        log.blank()
        subheading('AI tools')
        const AI_TOOL_LABELS: Record<string, string> = {
          claude_code: 'Claude Code',
          cursor:      'Cursor',
          copilot:     'GitHub Copilot',
          codex:       'OpenAI Codex',
        }
        table(
          fingerprint.aiCLIs.map((ai) => [
            AI_TOOL_LABELS[ai.tool] ?? ai.tool,
            ai.evidence.join(', ') || '—',
            ai.confidence,
          ]),
        )
      }

      // ── Step 3: Generate AI questionnaire ────────────────────────────────

      let aiQuestions: AIQuestion[] = []
      const questionnaireCapture = { prompt: '', response: '' }

      if (!options.yes) {
        const qSpin = spinner('Generating project-specific questions…').start()
        try {
          const questionnaireLogger: VerboseLogger = {
            onPrompt:   (p) => { questionnaireCapture.prompt = p },
            onResponse: (r) => { questionnaireCapture.response = r },
          }
          aiQuestions = await generateQuestionnaire(fingerprint, questionnaireLogger)
          if (aiQuestions.length > 0) {
            qSpin.succeed(`Generated ${aiQuestions.length} contextual questions`)
          } else {
            qSpin.info('No contextual questions generated')
          }
        } catch (err) {
          qSpin.warn('Could not generate contextual questions — using defaults')
          log.info(err instanceof Error ? err.message : String(err))
        }
        if (options.verbose) {
          verboseBlock('Questionnaire prompt', questionnaireCapture.prompt)
          verboseBlock('Questionnaire response', questionnaireCapture.response)
        }
      }

      // ── Step 4: Run interviewer (static + AI questions) ──────────────────

      const userContext = await runInterviewer({ yes: options.yes }, aiQuestions)
      const { workflowConfig, qa } = userContext

      // ── Steps 5+6: Generate skills (and optionally architect) ────────────
      //   Sequential by default; parallel when useSubagents + architectEnabled.

      let aiSkills: AISkill[] = []
      const skillsCapture = { prompt: '', response: '' }
      const archCapture   = { prompt: '', response: '' }
      const skillsLogger: VerboseLogger = {
        onPrompt:   (p) => { skillsCapture.prompt = p },
        onResponse: (r) => { skillsCapture.response = r },
      }
      const archLogger: VerboseLogger = {
        onPrompt:   (p) => { archCapture.prompt = p },
        onResponse: (r) => { archCapture.response = r },
      }
      const qaArg = Object.keys(qa).length > 0 ? qa : undefined

      if (workflowConfig.useSubagents && workflowConfig.architectEnabled) {
        // ── Parallel path ────────────────────────────────────────────────────
        const spin = spinner('Generating skills and architect skill in parallel…').start()
        const [skillsResult, archResult] = await Promise.allSettled([
          generateAISkills(fingerprint, skillsLogger, qaArg),
          generateArchitectSkill(fingerprint, workflowConfig, archLogger, qaArg),
        ])
        const skillsOk = skillsResult.status === 'fulfilled'
        const archOk   = archResult.status === 'fulfilled'
        if (skillsOk)  aiSkills = skillsResult.value
        if (archOk)    aiSkills = [archResult.value, ...aiSkills]
        if (skillsOk && archOk) {
          spin.succeed(`Generated ${aiSkills.length} skills in parallel`)
        } else if (skillsResult.status === 'rejected' && archResult.status === 'rejected') {
          spin.warn('Could not generate skills or architect skill — skipping')
          log.info(skillsResult.reason instanceof Error ? skillsResult.reason.message : String(skillsResult.reason))
        } else if (skillsResult.status === 'rejected') {
          spin.warn(`Generated ${aiSkills.length} skill(s) — skills generation failed`)
          log.info(skillsResult.reason instanceof Error ? skillsResult.reason.message : String(skillsResult.reason))
        } else if (archResult.status === 'rejected') {
          spin.warn(`Generated ${aiSkills.length} skill(s) — architect skill failed`)
          log.info(archResult.reason instanceof Error ? archResult.reason.message : String(archResult.reason))
        }
      } else {
        // ── Sequential path ──────────────────────────────────────────────────
        const skillsSpin = spinner('Generating project skills…').start()
        try {
          aiSkills = await generateAISkills(fingerprint, skillsLogger, qaArg)
          skillsSpin.succeed(`Generated ${aiSkills.length} project skills`)
        } catch (err) {
          skillsSpin.warn('Could not generate skills — skipping')
          log.info(err instanceof Error ? err.message : String(err))
        }

        if (workflowConfig.architectEnabled) {
          const archSpin = spinner('Generating architect skill…').start()
          try {
            const architectSkill = await generateArchitectSkill(fingerprint, workflowConfig, archLogger, qaArg)
            aiSkills = [architectSkill, ...aiSkills]
            archSpin.succeed('Generated architect skill')
          } catch (err) {
            archSpin.warn('Could not generate architect skill — skipping')
            log.info(err instanceof Error ? err.message : String(err))
          }
        }
      }

      if (options.verbose) {
        verboseBlock('Skills prompt', skillsCapture.prompt)
        verboseBlock('Skills response', skillsCapture.response)
        if (workflowConfig.architectEnabled) {
          verboseBlock('Architect prompt', archCapture.prompt)
          verboseBlock('Architect response', archCapture.response)
        }
      }

      // ── Step 5b: Generate methodology skills ─────────────────────────────

      const methCapture = { prompt: '', response: '' }
      const methLogger: VerboseLogger = {
        onPrompt:   (p) => { methCapture.prompt = p },
        onResponse: (r) => { methCapture.response = r },
      }
      const methSpin = spinner('Generating methodology skills…').start()
      try {
        const taskSkillIds = aiSkills.map((s) => s.id)
        const methodologySkills = await generateMethodologySkills(
          fingerprint, methLogger, qaArg, [], taskSkillIds,
        )
        aiSkills = [...aiSkills, ...methodologySkills]
        methSpin.succeed(`Generated ${methodologySkills.length} methodology skills`)
      } catch (err) {
        methSpin.warn('Could not generate methodology skills — skipping')
        log.info(err instanceof Error ? err.message : String(err))
      }
      if (options.verbose) {
        verboseBlock('Methodology prompt', methCapture.prompt)
        verboseBlock('Methodology response', methCapture.response)
      }

      // ── Step 7: Generate files ───────────────────────────────────────────

      const projectConfig = defaultProjectConfig()
      const globalConfig  = defaultGlobalConfig()

      // ── Step 7a: Load installed packs ────────────────────────────────────
      const installedPacks = await loadInstalledPacks(repoRoot)

      const generatorInput = {
        fingerprint,
        installedPackages: installedPacks,
        projectConfig,
        globalConfig,
        aiSkills,
        workflowConfig,
        userAnswers: Object.keys(qa).length > 0 ? qa : undefined,
      }

      // Union of: user-selected tools + any AI tools already configured in the repo
      const toolsToGenerate = new Set<string>([
        ...selectedToolIds,
        ...fingerprint.aiCLIs.map((a) => a.tool),
      ])

      const generatedFiles: GeneratedFile[] = selectGenerators(toolsToGenerate)
        .flatMap((g) => g.generate(generatorInput))

      const detectedTools = [...toolsToGenerate]

      // ── Step 8: Show generation plan ─────────────────────────────────────

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

      // ── Step 9: Confirm ──────────────────────────────────────────────────

      if (!options.yes) {
        const go = await confirm({ message: 'Write these files?' })
        if (isCancel(go) || go === false) { cancel('Aborted.'); process.exit(0) }
      }

      // ── Step 10: Write files ─────────────────────────────────────────────

      log.blank()
      for (const { file, absPath, action } of plan) {
        await writeGeneratedFile(file, absPath)
        log.success(`${action === 'create' ? 'Created' : 'Updated'} ${absPath}`)
      }

      // ── Step 11: Save fingerprint + config ───────────────────────────────

      await saveFingerprint(repoRoot, fingerprint)
      log.success(`Saved .openskulls/fingerprint.json`)

      await saveConfig(repoRoot, workflowConfig, detectedTools, qa)
      log.success(`Saved .openskulls/config.toml`)

      // ── Step 12: Install git hook ─────────────────────────────────────────

      const gitDir = join(repoRoot, '.git')
      if (existsSync(gitDir)) {
        try {
          await installGitHook(repoRoot)
          log.success('Installed .git/hooks/post-commit (auto-sync on commit)')
        } catch {
          log.warn('Could not install git hook — skipping')
        }
      } else {
        log.info('No .git directory — skipping hook install')
      }

      // ── Done ─────────────────────────────────────────────────────────────

      outro(`Done. AI context is ready in ${fingerprint.repoName}.`)
    })
}

// ─── Tool selection UI ────────────────────────────────────────────────────────

const TOOL_MENU = [
  { value: 'claude_code', label: 'Claude Code',    hint: 'CLAUDE.md + .claude/commands/' },
  { value: 'copilot',     label: 'GitHub Copilot', hint: '.github/copilot-instructions.md' },
  { value: 'codex',       label: 'OpenAI Codex',   hint: 'AGENTS.md' },
  { value: 'cursor',      label: 'Cursor',          hint: '.cursor/rules/project.mdc' },
]

async function askAITools(): Promise<string[]> {
  const result = await circleMultiselect({
    message: 'Which AI tool(s) do you use?',
    options: TOOL_MENU,
    initialValues: ['claude_code'],
  })
  if (isCancel(result)) { cancel('Cancelled.'); process.exit(0) }
  return result as string[]
}

// ─── Config writer ────────────────────────────────────────────────────────────

const ALL_TARGETS = ['claude_code', 'codex', 'copilot', 'cursor'] as const

async function saveConfig(
  repoRoot: string,
  workflowConfig: import('../../core/config/types.js').WorkflowConfig,
  detectedTools: string[],
  qa: Record<string, string>,
): Promise<void> {
  const configPath = join(repoRoot, '.openskulls', 'config.toml')
  const targets = ALL_TARGETS.map((name) => ({
    name,
    enabled: detectedTools.includes(name),
  }))
  const configData = {
    schema_version: '1.0.0',
    targets,
    exclude_paths: [
      'node_modules', '.git', 'dist', 'build',
      '.venv', '__pycache__', '.next', '.nuxt', 'coverage',
    ],
    workflow: {
      auto_docs:         workflowConfig.autoDocs,
      auto_commit:       workflowConfig.autoCommit,
      architect_enabled: workflowConfig.architectEnabled,
      architect_domain:  workflowConfig.architectDomain,
      architect_review:  workflowConfig.architectReview,
      use_subagents:     workflowConfig.useSubagents,
      ...(Object.keys(qa).length > 0 ? { answers: qa } : {}),
    },
  }
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, tomlStringify(configData), 'utf-8')
}

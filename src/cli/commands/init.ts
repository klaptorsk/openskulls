/**
 * openskulls init — first-time setup for a repository.
 *
 * Flow:
 *  1. Analyse repo with FingerprintCollector
 *  2. Show detected signals
 *  3. Run ClaudeCodeGenerator → GeneratedFile[]
 *  4. Show generation plan (what will be written)
 *  5. Confirm (skip with --yes)
 *  6. Write files (merge_sections for CLAUDE.md, replace otherwise)
 *  7. Save fingerprint.json and config.toml
 */

import { createInterface } from 'node:readline/promises'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { stringify as tomlStringify } from 'smol-toml'
import type { Command } from 'commander'
import { FingerprintCollector } from '../../core/fingerprint/collector.js'
import { saveFingerprint } from '../../core/fingerprint/cache.js'
import { getBuiltinAnalyzers } from '../../core/analyzers/registry.js'
import { ClaudeCodeGenerator } from '../../core/generators/claude-code.js'
import { resolveFilePath, type GeneratedFile } from '../../core/generators/base.js'
import { mergeSections } from '../../core/generators/merge.js'
import { defaultProjectConfig, defaultGlobalConfig } from '../../core/config/types.js'
import {
  divider, fatal, fileList, heading, log, panel, spinner, subheading, table,
} from '../ui/console.js'

// ─── Command ──────────────────────────────────────────────────────────────────

export function registerInit(program: Command): void {
  program
    .command('init [path]')
    .description('Analyse a repository and generate AI context files')
    .option('-n, --dry-run', 'Show what would be generated without writing files')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (
      path: string = '.',
      options: { dryRun?: boolean; yes?: boolean },
    ) => {
      const repoRoot = resolve(path)

      panel('OpenSkulls init', [repoRoot])

      // ── Step 1: Analyse ──────────────────────────────────────────────────

      const spin = spinner('Analysing repository…').start()

      let fingerprint
      try {
        const collector = new FingerprintCollector(getBuiltinAnalyzers())
        fingerprint = await collector.collect(repoRoot)
        spin.succeed('Repository analysed')
      } catch (err) {
        spin.fail('Analysis failed')
        fatal(
          `Could not analyse ${repoRoot}`,
          err instanceof Error ? err.message : String(err),
        )
      }

      // ── Step 2: Show detected signals ────────────────────────────────────

      log.blank()
      heading('Detected signals')

      if (fingerprint.languages.length === 0) {
        log.warn('No languages detected. Is this an empty or unsupported repo?')
      } else {
        table(
          fingerprint.languages.map((l) => [
            `${l.name}${l.primary ? ' (primary)' : ''}`,
            `${l.percentage.toFixed(0)}%${l.version ? `  v${l.version}` : ''}  [${l.confidence}]`,
          ]),
        )
      }

      if (fingerprint.frameworks.length > 0) {
        log.blank()
        subheading('Frameworks')
        table(
          fingerprint.frameworks.map((f) => [
            f.name,
            `${f.category}${f.version ? `  v${f.version}` : ''}  [${f.confidence}]`,
          ]),
        )
      }

      if (fingerprint.testing) {
        log.blank()
        log.info(`Testing: ${fingerprint.testing.framework}${fingerprint.testing.pattern ? `  (${fingerprint.testing.pattern})` : ''}`)
      }

      if (fingerprint.linting && fingerprint.linting.tools.length > 0) {
        log.info(`Linting: ${fingerprint.linting.tools.join(', ')}`)
      }

      // ── Step 3: Generate files ───────────────────────────────────────────

      const projectConfig = defaultProjectConfig()
      const globalConfig  = defaultGlobalConfig()

      const gen = new ClaudeCodeGenerator()
      const generatedFiles = gen.generate({
        fingerprint,
        installedPackages: [],
        projectConfig,
        globalConfig,
      })

      // ── Step 4: Show generation plan ─────────────────────────────────────

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

      // ── Step 5: Confirm ──────────────────────────────────────────────────

      if (!options.yes) {
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const answer = await rl.question('Write these files? [Y/n] ')
        rl.close()
        if (answer.trim().toLowerCase() === 'n') {
          log.info('Aborted.')
          process.exit(0)
        }
      }

      // ── Step 6: Write files ──────────────────────────────────────────────

      log.blank()
      for (const { file, absPath, action } of plan) {
        await writeGeneratedFile(file, absPath)
        log.success(`${action === 'create' ? 'Created' : 'Updated'} ${absPath}`)
      }

      // ── Step 7: Save fingerprint + config ────────────────────────────────

      await saveFingerprint(repoRoot, fingerprint)
      log.success(`Saved .openskulls/fingerprint.json`)

      await saveConfig(repoRoot)
      log.success(`Saved .openskulls/config.toml`)

      // ── Done ─────────────────────────────────────────────────────────────

      log.blank()
      divider()
      log.success(`Done. AI context is ready in ${fingerprint.repoName}.`)
      log.info('Run `openskulls audit` to check for drift after future changes.')
    })
}

// ─── File writer ──────────────────────────────────────────────────────────────

async function writeGeneratedFile(file: GeneratedFile, absPath: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true })

  if (file.mergeStrategy === 'merge_sections' && existsSync(absPath)) {
    const existing = await readFile(absPath, 'utf-8')
    const merged = mergeSections(existing, file.content)
    await writeFile(absPath, merged, 'utf-8')
    return
  }

  if (file.mergeStrategy === 'append' && existsSync(absPath)) {
    const existing = await readFile(absPath, 'utf-8')
    if (!existing.includes(file.content.trim())) {
      await writeFile(absPath, existing + '\n' + file.content, 'utf-8')
    }
    return
  }

  await writeFile(absPath, file.content, 'utf-8')
}

// ─── Config writer ────────────────────────────────────────────────────────────

async function saveConfig(repoRoot: string): Promise<void> {
  const configPath = join(repoRoot, '.openskulls', 'config.toml')
  const configData = {
    schema_version: '1.0.0',
    targets: [{ name: 'claude_code', enabled: true }],
    exclude_paths: [
      'node_modules', '.git', 'dist', 'build',
      '.venv', '__pycache__', '.next', '.nuxt', 'coverage',
    ],
  }
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, tomlStringify(configData), 'utf-8')
}

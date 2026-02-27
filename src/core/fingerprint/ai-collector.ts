/**
 * AIFingerprintCollector — replaces the old FingerprintCollector + analyzers.
 *
 * Instead of hand-written TypeScript parsers, this:
 *  1. Scans the file tree locally (fast, no AI needed)
 *  2. Detects AI CLIs from file presence (pure logic)
 *  3. Invokes an AI CLI (`claude -p`) with the repo context
 *  4. Zod-validates the JSON response into a RepoFingerprint
 *
 * The generators (ClaudeCodeGenerator etc.) are completely unaffected —
 * they consume RepoFingerprint which is unchanged.
 */

import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { z } from 'zod'
import type { ProjectConfig } from '../config/types.js'
import {
  type AICLISignal,
  ArchitectureSignal,
  CICDSignal,
  ConventionSignal,
  DependencyMap,
  FrameworkSignal,
  LanguageSignal,
  LintingSignal,
  TestingSignal,
  createFingerprint,
  type RepoFingerprint,
} from './types.js'
import { buildAnalysisPrompt } from './prompt-builder.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Config filenames that trigger recognition and content reading. */
const KNOWN_CONFIG_FILES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'tsconfig.json', 'tsconfig.base.json', 'jsconfig.json',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'requirements-dev.txt',
  'go.mod', 'go.sum',
  'Cargo.toml', 'Cargo.lock',
  '.nvmrc', '.node-version', '.python-version',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs',
  '.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js',
  'ruff.toml', '.ruff.toml', 'mypy.ini', '.mypy.ini', 'pytest.ini',
  'vitest.config.ts', 'vitest.config.js', 'jest.config.ts', 'jest.config.js',
  '.golangci.yml', 'golangci.yml',
  'Makefile', '.github',
  // AI coding CLI config files
  'CLAUDE.md', '.cursorrules', 'copilot-instructions.md', 'project.mdc',
])

/** Lock files — huge, zero analysis value, always skip for AI prompt. */
const LOCK_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'go.sum', 'Cargo.lock',
])

const DEFAULT_EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', '.venv', '__pycache__',
  '.next', '.nuxt', 'coverage', '.nyc_output', 'vendor', 'target',
  '.mypy_cache', '.ruff_cache', '.pytest_cache', '.tsbuildinfo',
])

const MAX_DEPTH = 6
const MAX_CONFIG_FILE_BYTES = 32_768

/**
 * Describes how to invoke an AI CLI.
 *   stdin — prompt written to child.stdin (e.g. `claude -p -`)
 *   arg   — prompt passed as the argument to -p (e.g. `codex -p "..."`)
 */
export interface AICLIAdapter {
  command: string
  invoke: 'stdin' | 'arg'
  version?: string
}

/** AI CLI commands to search for, in priority order. */
const AI_CLI_CANDIDATES: AICLIAdapter[] = [
  { command: 'claude',  invoke: 'stdin' },
  { command: 'codex',   invoke: 'arg'   },
  { command: 'copilot', invoke: 'arg'   },
]

// ─── AI Analysis Response schema ──────────────────────────────────────────────

/**
 * The JSON structure the AI is asked to return.
 * Excludes fields computed by our code: aiCLIs, primaryLanguage, primaryFramework,
 * repoRoot, repoName, contentHash, schemaVersion, generatedAt.
 */
export const AIAnalysisResponse = z.object({
  languages:    z.array(LanguageSignal).default([]),
  frameworks:   z.array(FrameworkSignal).default([]),
  conventions:  z.array(ConventionSignal).default([]),
  dependencies: z.array(DependencyMap).default([]),
  testing:      TestingSignal.optional(),
  cicd:         CICDSignal.optional(),
  linting:      LintingSignal.optional(),
  architecture: ArchitectureSignal.default({ style: 'unknown' }),
  description:  z.string().optional(),
})
export type AIAnalysisResponse = z.infer<typeof AIAnalysisResponse>

// ─── Verbose logger ───────────────────────────────────────────────────────────

/**
 * Optional observer for AI calls. Callbacks are fired synchronously inside
 * invokeAICLI — callers should store the values and display them after any
 * spinner has settled to avoid interleaved terminal output.
 */
export interface VerboseLogger {
  onPrompt(prompt: string): void
  onResponse(response: string): void
}

// ─── Collector ────────────────────────────────────────────────────────────────

export class AIFingerprintCollector {
  async collect(
    repoRoot: string,
    config?: Partial<ProjectConfig>,
    logger?: VerboseLogger,
  ): Promise<RepoFingerprint> {
    const excludeSet = new Set([
      ...DEFAULT_EXCLUDE,
      ...(config?.excludePaths ?? []),
    ])

    // Step 1: Scan file tree (local, fast, no AI)
    const { fileTree, configFiles } = await scanRepo(repoRoot, excludeSet)

    // Step 2: Read key config file contents for the AI prompt
    const configContents = await readConfigContents(configFiles)

    // Step 3: Detect AI CLIs from file presence (pure logic, runs before AI call)
    const aiCLIs = detectAICLIs(fileTree, configFiles)

    // Step 4: Find AI CLI in PATH
    const cliCommand = await detectAICLI()

    // Step 5: Build prompt and invoke AI
    const prompt = buildAnalysisPrompt(basename(repoRoot), fileTree, configContents)
    const rawResponse = await invokeAICLI(cliCommand, prompt, 120_000, logger)

    // Step 6: Parse + Zod-validate response
    const analysis = AIAnalysisResponse.parse(JSON.parse(stripJsonFences(rawResponse)))

    // Step 7: Compute primary language (highest % wins)
    const languages =
      analysis.languages.length > 0
        ? (() => {
            const maxPct = Math.max(...analysis.languages.map((l) => l.percentage))
            return analysis.languages.map((l) => ({ ...l, primary: l.percentage === maxPct }))
          })()
        : []

    const primaryLang = languages.find((l) => l.primary)
    const primaryFramework =
      analysis.frameworks.find((f) => f.category === 'fullstack') ??
      analysis.frameworks.find((f) => f.category === 'backend')

    return createFingerprint({
      repoRoot,
      repoName: basename(repoRoot),
      languages,
      frameworks:   analysis.frameworks,
      conventions:  analysis.conventions,
      dependencies: analysis.dependencies,
      testing:      analysis.testing,
      cicd:         analysis.cicd,
      linting:      analysis.linting,
      architecture: analysis.architecture,
      aiCLIs,
      description:  analysis.description,
      primaryLanguage:  primaryLang?.name,
      primaryFramework: primaryFramework?.name,
    })
  }
}

// ─── AI CLI detection ─────────────────────────────────────────────────────────

/**
 * On Windows, npm-installed CLIs are .cmd wrappers (e.g. claude.cmd).
 * Node's spawn() does not resolve PATHEXT without a shell, so we try the
 * .cmd suffix first, then the bare name as a fallback.
 */
const WIN_CMD_SUFFIXES = process.platform === 'win32' ? ['.cmd', ''] : ['']

/**
 * Run `command --version` and return the first line of output.
 * Checks both stdout and stderr (some CLIs write version to stderr).
 * Resolves with the version string on exit code 0, rejects otherwise.
 */
async function trySpawnVersion(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, ['--version'])
    let out = ''

    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { out += d.toString() })

    child.on('error', reject)

    child.on('close', (code: number | null) => {
      const firstLine = out.trim().split('\n')[0]?.trim() ?? ''
      if (code === 0 && firstLine) {
        resolve(firstLine)
      } else {
        reject(new Error(`${cmd} --version exited ${String(code)}`))
      }
    })
  })
}

export async function detectAICLI(): Promise<AICLIAdapter> {
  for (const candidate of AI_CLI_CANDIDATES) {
    for (const suffix of WIN_CMD_SUFFIXES) {
      const cmd = candidate.command + suffix
      try {
        const version = await trySpawnVersion(cmd)
        // Store the resolved command (e.g. 'claude.cmd') so invokeAICLI uses the same path
        return { ...candidate, command: cmd, version }
      } catch {
        // try next suffix or next candidate
      }
    }
  }

  throw new Error(
    'No AI CLI found in PATH.\nInstall Claude Code (https://claude.ai/code), Codex, or Copilot.',
  )
}

// ─── AI CLI invocation ────────────────────────────────────────────────────────

export async function invokeAICLI(
  adapter: AICLIAdapter,
  prompt: string,
  timeoutMs = 120_000,
  logger?: VerboseLogger,
): Promise<string> {
  logger?.onPrompt(prompt)

  return new Promise((resolve, reject) => {
    // stdin style: `claude -p -`  — prompt written to child.stdin
    // arg style:   `codex -p "…"` — prompt passed as the -p argument
    const args = adapter.invoke === 'stdin' ? ['-p', '-'] : ['-p', prompt]
    const child = spawn(adapter.command, args)
    let out = ''
    let err = ''

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`AI CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })

    child.on('error', (e: Error) => {
      clearTimeout(timer)
      reject(e)
    })

    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (code === 0) {
        logger?.onResponse(out)
        resolve(out)
      } else {
        reject(new Error(`${adapter.command} exited ${String(code)}: ${err}`))
      }
    })

    if (adapter.invoke === 'stdin') {
      child.stdin.on('error', () => { /* ignore broken pipe */ })
      child.stdin.write(prompt)
      child.stdin.end()
    }
  })
}

// ─── AI CLI signal detection (pure) ──────────────────────────────────────────

/**
 * Detect which AI coding CLIs are configured in this repo.
 * Pure function — checks file/directory presence only, no AI needed.
 * Exported for testing.
 */
export function detectAICLIs(
  fileTree: readonly string[],
  configFiles: ReadonlyMap<string, string>,
): AICLISignal[] {
  const signals: AICLISignal[] = []

  // Claude Code — CLAUDE.md or .claude/ directory
  {
    const evidence: string[] = []
    if (configFiles.has('CLAUDE.md')) evidence.push('CLAUDE.md found')
    if (fileTree.some((f) => f.startsWith('.claude/'))) evidence.push('.claude/ directory found')
    if (evidence.length > 0) signals.push({ tool: 'claude_code', confidence: 'high', evidence })
  }

  // GitHub Copilot — .github/copilot-instructions.md
  {
    const evidence: string[] = []
    const copilotPath = configFiles.get('copilot-instructions.md')
    if (copilotPath?.includes('.github')) evidence.push('.github/copilot-instructions.md found')
    if (evidence.length > 0) signals.push({ tool: 'copilot', confidence: 'high', evidence })
  }

  // Cursor — .cursorrules or .cursor/ directory
  {
    const evidence: string[] = []
    if (configFiles.has('.cursorrules')) evidence.push('.cursorrules found')
    if (fileTree.some((f) => f.startsWith('.cursor/'))) evidence.push('.cursor/ directory found')
    if (evidence.length > 0) signals.push({ tool: 'cursor', confidence: 'high', evidence })
  }

  return signals
}

// ─── JSON fence stripping ─────────────────────────────────────────────────────

/**
 * Strip markdown code fences from AI output.
 * Handles ```json ... ```, ``` ... ```, and plain JSON.
 * Exported for testing.
 */
export function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '').trim()
}

// ─── File tree scanner ────────────────────────────────────────────────────────

interface ScanResult {
  fileTree: readonly string[]
  configFiles: ReadonlyMap<string, string>
}

async function scanRepo(repoRoot: string, excludeSet: ReadonlySet<string>): Promise<ScanResult> {
  const fileTree: string[] = []
  const configFiles = new Map<string, string>()

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (excludeSet.has(entry.name)) continue

      const absPath = join(dir, entry.name)
      const relPath = relative(repoRoot, absPath)

      if (entry.isDirectory()) {
        await walk(absPath, depth + 1)
      } else if (entry.isFile()) {
        fileTree.push(relPath)
        // Prefer shallower paths — first occurrence wins
        if (KNOWN_CONFIG_FILES.has(entry.name) && !configFiles.has(entry.name)) {
          configFiles.set(entry.name, absPath)
        }
      }
    }
  }

  await walk(repoRoot, 0)
  return { fileTree, configFiles }
}

// ─── Config content reader ────────────────────────────────────────────────────

async function readConfigContents(
  configFiles: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>()

  for (const [name, absPath] of configFiles) {
    if (LOCK_FILES.has(name)) continue  // too large, no analysis value

    try {
      const buf = await readFile(absPath)
      contents.set(name, buf.slice(0, MAX_CONFIG_FILE_BYTES).toString('utf-8'))
    } catch {
      // ignore unreadable files
    }
  }

  return contents
}

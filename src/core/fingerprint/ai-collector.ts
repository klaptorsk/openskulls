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

/**
 * AI instruction files — detected for presence (for detectAICLIs) but content
 * is never sent to Claude. Injecting their content into the analysis prompt can
 * cause prompt injection: the target repo's AI instructions override openskulls'
 * "return only JSON" directive and produce non-JSON output.
 */
const AI_INSTRUCTION_FILES = new Set([
  'CLAUDE.md', '.cursorrules', 'copilot-instructions.md', 'project.mdc',
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
 *   invoke — 'stdin': prompt written to child.stdin (e.g. `claude -p -`)
 *            'arg':   prompt passed as the -p argument (e.g. `copilot -p "…"`)
 *   shell  — how to spawn the command:
 *            false (default): direct binary lookup, no shell
 *            true:            cmd.exe on Windows, /bin/sh on Unix
 *            'powershell':    powershell.exe (Windows only); prompt passed via
 *                             env var to avoid quoting/length issues
 */
export interface AICLIAdapter {
  command: string
  invoke: 'stdin' | 'arg'
  version?: string
  shell?: boolean | 'powershell'
}

/** AI CLI commands to search for, in priority order. */
const AI_CLI_CANDIDATES: AICLIAdapter[] = [
  { command: 'claude',  invoke: 'stdin' },
  { command: 'codex',   invoke: 'arg'   },
  { command: 'copilot', invoke: 'stdin'   },
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
    adapter?: AICLIAdapter,
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

    // Step 4: Find AI CLI in PATH (use provided adapter or auto-detect)
    const cliCommand = adapter ?? await detectAICLI()

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
 * Try running `cmd [extraArgs] --version` using the specified shell mode.
 * Resolves with the first line of output (may be empty — some CLIs don't
 * implement --version). Rejects only on ENOENT/EACCES (command not found).
 */
function spawnVersion(
  cmd: string,
  extraArgs: string[],
  shellMode: boolean | 'powershell',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const versionArgs = [...extraArgs, '--version']
    const child =
      shellMode === 'powershell'
        ? spawn('powershell.exe', ['-NoProfile', '-Command', [cmd, ...versionArgs].join(' ')])
        : spawn(cmd, versionArgs, { shell: shellMode })

    let out = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { out += d.toString() })
    child.on('error', reject)
    child.on('close', () => { resolve(out.trim().split('\n')[0]?.trim() ?? '') })
  })
}

/**
 * Probe whether a command is available, trying progressively more permissive
 * shell modes until one succeeds:
 *   1. Direct binary lookup (shell: false)
 *   2. cmd.exe on Windows / /bin/sh on Unix (shell: true)
 *   3. powershell.exe (Windows only) — catches commands that are only
 *      accessible from PowerShell (PS modules, PS profile additions, etc.)
 *
 * Returns { version, shell } so invokeAICLI can use the same execution path.
 */
async function trySpawnVersion(
  cmd: string,
  extraArgs: string[] = [],
): Promise<{ version: string; shell: boolean | 'powershell' }> {
  const modes: Array<boolean | 'powershell'> = [false, true]
  if (process.platform === 'win32') modes.push('powershell')

  for (const mode of modes) {
    try {
      const version = await spawnVersion(cmd, extraArgs, mode)
      return { version, shell: mode }
    } catch {
      // try next mode
    }
  }

  throw new Error(`${cmd} not found`)
}

export async function detectAICLI(): Promise<AICLIAdapter> {
  for (const candidate of AI_CLI_CANDIDATES) {
    for (const suffix of WIN_CMD_SUFFIXES) {
      const cmd = candidate.command + suffix
      try {
        const { version, shell } = await trySpawnVersion(cmd)
        return { ...candidate, command: cmd, version, shell }
      } catch {
        // try next suffix or next candidate
      }
    }
  }

  throw new Error('Install Claude Code, OpenAI Codex, or GitHub Copilot.')
}

/** Maps tool IDs (from AICLISignal / generator registry) to CLI command names. */
const TOOL_TO_CLI: Readonly<Record<string, string>> = {
  claude_code: 'claude',
  copilot:     'copilot',
  codex:       'codex',
  // cursor has no invocable CLI
}

/**
 * Like detectAICLI() but only tries candidates whose tool ID appears in
 * toolIds (in the priority order of AI_CLI_CANDIDATES).
 * Falls back to detectAICLI() if none of the selected tools are available.
 */
export async function detectAICLIFor(toolIds: string[]): Promise<AICLIAdapter> {
  const wantedCmds = new Set(toolIds.flatMap((id) => (TOOL_TO_CLI[id] ? [TOOL_TO_CLI[id]] : [])))
  const filtered = AI_CLI_CANDIDATES.filter((c) => wantedCmds.has(c.command))

  for (const candidate of filtered) {
    for (const suffix of WIN_CMD_SUFFIXES) {
      const cmd = candidate.command + suffix
      try {
        const { version, shell } = await trySpawnVersion(cmd)
        return { ...candidate, command: cmd, version, shell }
      } catch {
        // try next
      }
    }
  }

  // None of the selected tools found in PATH — fall back to any available CLI
  return detectAICLI()
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
    // Spawn the child using the shell mode detected during CLI discovery.
    //
    // powershell mode: prompt is passed via an env var (__OPENSKULLS_PROMPT)
    //   so PowerShell expands it cleanly without quoting or cmd-line length issues.
    //   The PS command reads:  copilot -p $env:__OPENSKULLS_PROMPT
    //
    // stdin mode: `claude -p -` — prompt is written to child.stdin after spawn.
    // arg mode:   `codex -p "…"` — prompt is the -p argument (default shell escape).
    let child: ReturnType<typeof spawn>
    if (adapter.shell === 'powershell') {
      const psCmd = `${adapter.command} -p $env:__OPENSKULLS_PROMPT`
      child = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
        env: { ...process.env, __OPENSKULLS_PROMPT: prompt },
      })
    } else {
      const args = adapter.invoke === 'stdin' ? ['-p', '-'] : ['-p', prompt]
      child = spawn(adapter.command, args, { shell: adapter.shell === true })
    }

    let out = ''
    let err = ''

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`AI CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { err += d.toString() })

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

    if (adapter.invoke === 'stdin' && adapter.shell !== 'powershell') {
      child.stdin?.on('error', () => { /* ignore broken pipe */ })
      child.stdin?.write(prompt)
      child.stdin?.end()
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
  // Codex - project.mdc file containing "codex" (not an official marker, but better than nothing)
  {
    const evidence: string[] = []
    const mdcPath = configFiles.get('project.mdc')
    if (mdcPath?.includes('codex')) evidence.push('project.mdc mentioning codex found')
    if (evidence.length > 0) signals.push({ tool: 'codex', confidence: 'medium', evidence })
      
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
  const stripped = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '').trim()
  if (stripped.startsWith('{')) return stripped

  // Some AI CLIs (e.g. copilot) prepend natural-language commentary before the
  // JSON object. Fall back to extracting the outermost { … } block.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) return text.slice(start, end + 1)

  return stripped // will fail JSON.parse with a sensible error
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
    if (LOCK_FILES.has(name)) continue           // too large, no analysis value
    if (AI_INSTRUCTION_FILES.has(name)) continue // prompt injection risk

    try {
      const buf = await readFile(absPath)
      contents.set(name, buf.slice(0, MAX_CONFIG_FILE_BYTES).toString('utf-8'))
    } catch {
      // ignore unreadable files
    }
  }

  return contents
}

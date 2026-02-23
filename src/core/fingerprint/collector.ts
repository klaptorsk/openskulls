/**
 * FingerprintCollector — orchestrates all analyzers and merges their results
 * into a single RepoFingerprint.
 */

import { readdir } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import type { Analyzer, AnalyzerResult } from '../analyzers/base.js'
import type { ProjectConfig } from '../config/types.js'
import {
  type ArchitectureSignal,
  type LintingSignal,
  type RepoFingerprint,
  createFingerprint,
} from './types.js'

// ─── Known config filenames ───────────────────────────────────────────────────

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
])

const DEFAULT_EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', '.venv', '__pycache__',
  '.next', '.nuxt', 'coverage', '.nyc_output', 'vendor', 'target',
  '.mypy_cache', '.ruff_cache', '.pytest_cache', '.tsbuildinfo',
])

const MAX_DEPTH = 6

// ─── Collector ───────────────────────────────────────────────────────────────

export class FingerprintCollector {
  private readonly analyzers: readonly Analyzer[]

  constructor(analyzers: Analyzer[]) {
    this.analyzers = [...analyzers].sort((a, b) => a.priority - b.priority)
  }

  async collect(repoRoot: string, config?: Partial<ProjectConfig>): Promise<RepoFingerprint> {
    const excludeSet = new Set([
      ...DEFAULT_EXCLUDE,
      ...(config?.excludePaths ?? []),
    ])

    const { fileTree, configFiles } = await scanRepo(repoRoot, excludeSet)

    const ctx = {
      repoRoot,
      fileTree,
      configFiles,
      existingFingerprint: null,
    }

    const results: AnalyzerResult[] = []
    for (const analyzer of this.analyzers) {
      if (analyzer.canRun(ctx)) {
        results.push(analyzer.analyze(ctx))
      }
    }

    return mergeResults(repoRoot, results)
  }
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

// ─── Result merger ────────────────────────────────────────────────────────────

function mergeResults(repoRoot: string, results: AnalyzerResult[]): RepoFingerprint {
  // Collect all signals
  let languages = results.flatMap((r) => r.languages ?? [])
  const frameworks = results.flatMap((r) => r.frameworks ?? [])
  const conventions = results.flatMap((r) => r.conventions ?? [])
  const dependencies = results.flatMap((r) => r.dependencies ?? [])
  const testing = results.find((r) => r.testing != null)?.testing
  const cicd = results.find((r) => r.cicd != null)?.cicd

  // Merge linting — union all tools and configFiles
  const lintingResults = results.filter((r) => r.linting != null)
  const linting: LintingSignal | undefined =
    lintingResults.length > 0
      ? {
          tools: [...new Set(lintingResults.flatMap((r) => r.linting!.tools))],
          configFiles: [...new Set(lintingResults.flatMap((r) => r.linting!.configFiles))],
          styleRules: lintingResults.reduce<Record<string, string>>(
            (acc, r) => ({ ...acc, ...r.linting!.styleRules }),
            {},
          ),
        }
      : undefined

  // Merge architecture patches — later results override earlier ones
  const archPatch = results.reduce<Partial<ArchitectureSignal>>(
    (acc, r) => (r.architecturePatch != null ? { ...acc, ...r.architecturePatch } : acc),
    {},
  )

  // Compute primary language — highest percentage wins
  if (languages.length > 0) {
    const maxPct = Math.max(...languages.map((l) => l.percentage))
    languages = languages.map((l) => ({ ...l, primary: l.percentage === maxPct }))
  }

  const primaryLang = languages.find((l) => l.primary)
  const primaryFramework =
    frameworks.find((f) => f.category === 'fullstack') ??
    frameworks.find((f) => f.category === 'backend')

  return createFingerprint({
    repoRoot,
    repoName: basename(repoRoot),
    languages,
    frameworks,
    conventions,
    dependencies,
    testing,
    cicd,
    linting,
    architecture: {
      style: archPatch.style ?? 'unknown',
      entryPoints: archPatch.entryPoints ?? [],
      moduleStructure: archPatch.moduleStructure ?? [],
      apiStyle: archPatch.apiStyle,
      database: archPatch.database,
      hasMigrations: archPatch.hasMigrations ?? false,
    },
    primaryLanguage: primaryLang?.name,
    primaryFramework: primaryFramework?.name,
  })
}

/**
 * Core data types for repo fingerprinting.
 *
 * RepoFingerprint is the central data structure — the normalized, tool-agnostic
 * representation of everything OpenSkulls learned about a repository. All
 * generators consume it. No generator reads the filesystem directly.
 *
 * Zod schemas are the source of truth: TypeScript types are inferred from them,
 * giving us both compile-time safety and runtime validation in one place.
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const Confidence = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof Confidence>

// ─── Signals ─────────────────────────────────────────────────────────────────

export const LanguageSignal = z.object({
  name: z.string(),                                   // "TypeScript"
  version: z.string().optional(),                     // "5.3.2" if detectable
  confidence: Confidence,
  percentage: z.number().min(0).max(100),             // % of non-test source files
  primary: z.boolean().default(false),
  evidence: z.array(z.string()).default([]),           // ["tsconfig.json found"]
})
export type LanguageSignal = z.infer<typeof LanguageSignal>

export const FrameworkSignal = z.object({
  name: z.string(),                                   // "Next.js"
  version: z.string().optional(),
  confidence: Confidence,
  category: z.string(),                               // "frontend" | "backend" | "fullstack" | "testing" | "orm"
  evidence: z.array(z.string()).default([]),
})
export type FrameworkSignal = z.infer<typeof FrameworkSignal>

export const ConventionSignal = z.object({
  name: z.string(),                                   // "conventional_commits"
  value: z.string().optional(),                       // The detected pattern
  confidence: Confidence,
  evidence: z.array(z.string()).default([]),
})
export type ConventionSignal = z.infer<typeof ConventionSignal>

export const DependencyMap = z.object({
  runtime: z.record(z.string(), z.string()).default({}),  // { "react": "^18.0.0" }
  dev: z.record(z.string(), z.string()).default({}),
  peer: z.record(z.string(), z.string()).default({}),
  sourceFile: z.string(),                             // "package.json"
})
export type DependencyMap = z.infer<typeof DependencyMap>

export const TestingSignal = z.object({
  framework: z.string(),                              // "pytest", "jest", "vitest"
  pattern: z.string().optional(),                     // "**/*.test.ts"
  coverageTool: z.string().optional(),                // "c8", "coverage.py"
  confidence: Confidence,
})
export type TestingSignal = z.infer<typeof TestingSignal>

export const CICDSignal = z.object({
  platform: z.string(),                               // "github_actions", "gitlab_ci"
  workflows: z.array(z.string()).default([]),
  hasDeploy: z.boolean().default(false),
  deployTargets: z.array(z.string()).default([]),     // ["vercel", "aws"]
  confidence: Confidence,
})
export type CICDSignal = z.infer<typeof CICDSignal>

export const LintingSignal = z.object({
  tools: z.array(z.string()).default([]),             // ["eslint", "prettier"]
  configFiles: z.array(z.string()).default([]),
  styleRules: z.record(z.string(), z.string()).default({}),
})
export type LintingSignal = z.infer<typeof LintingSignal>

export const ArchitectureSignal = z.object({
  style: z.string(),                                  // "monorepo" | "monolith" | "microservices" | "library"
  entryPoints: z.array(z.string()).default([]),       // ["src/index.ts", "main.py"]
  moduleStructure: z.array(z.string()).default([]),   // top-level significant dirs
  apiStyle: z.string().optional(),                    // "rest" | "graphql" | "grpc" | "trpc"
  database: z.string().optional(),
  hasMigrations: z.boolean().default(false),
})
export type ArchitectureSignal = z.infer<typeof ArchitectureSignal>

export const GitSignal = z.object({
  commitStyle: z.string().optional(),                 // "conventional_commits" | "jira_prefixed"
  branchStrategy: z.string().optional(),              // "gitflow" | "trunk"
  primaryBranch: z.string().default('main'),
  contributorsCount: z.number().int().default(0),
  avgCommitFrequencyDays: z.number().optional(),
})
export type GitSignal = z.infer<typeof GitSignal>

export const AICLISignal = z.object({
  tool: z.enum(['claude_code', 'copilot', 'cursor']),
  confidence: Confidence,
  evidence: z.array(z.string()).default([]),
})
export type AICLISignal = z.infer<typeof AICLISignal>

// ─── RepoFingerprint ─────────────────────────────────────────────────────────

/**
 * Fields excluded from contentHash.
 * repoRoot is machine-specific. generatedAt changes every run.
 * These must not affect drift detection.
 */
const HASH_EXCLUDE = new Set(['contentHash', 'repoRoot', 'generatedAt'])

export const RepoFingerprint = z.object({
  schemaVersion: z.string().default('1.0.0'),
  generatedAt: z.string().default(() => new Date().toISOString()),
  repoRoot: z.string(),                               // Absolute path — machine-specific
  repoName: z.string(),

  languages: z.array(LanguageSignal).default([]),
  frameworks: z.array(FrameworkSignal).default([]),
  conventions: z.array(ConventionSignal).default([]),
  dependencies: z.array(DependencyMap).default([]),
  testing: TestingSignal.optional(),
  cicd: CICDSignal.optional(),
  linting: LintingSignal.optional(),
  architecture: ArchitectureSignal.default({ style: 'unknown' }),
  git: GitSignal.optional(),

  // Detected AI coding CLI tools
  aiCLIs: z.array(AICLISignal).default([]),

  // Human-readable description (from package.json or similar)
  description: z.string().optional(),

  // Computed shortcuts for generators
  primaryLanguage: z.string().optional(),
  primaryFramework: z.string().optional(),

  // Stable hash for drift detection — computed from all content fields
  contentHash: z.string().default(''),
})
export type RepoFingerprint = z.infer<typeof RepoFingerprint>

// ─── Hash helpers ────────────────────────────────────────────────────────────

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k]
    }
    return sorted
  }
  return value
}

function computeHash(fp: RepoFingerprint): string {
  const hashable = Object.fromEntries(
    Object.entries(fp).filter(([k]) => !HASH_EXCLUDE.has(k)),
  )
  return createHash('sha256')
    .update(JSON.stringify(hashable, sortedReplacer))
    .digest('hex')
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a RepoFingerprint, computing its contentHash automatically.
 * Use this instead of constructing the object directly.
 */
export function createFingerprint(
  data: Omit<RepoFingerprint, 'contentHash' | 'schemaVersion' | 'generatedAt'> &
    Partial<Pick<RepoFingerprint, 'schemaVersion' | 'generatedAt'>>,
): RepoFingerprint {
  const base = RepoFingerprint.parse({ ...data, contentHash: '' })
  return { ...base, contentHash: computeHash(base) }
}

/**
 * Parse a RepoFingerprint from a plain object (e.g. loaded from JSON).
 * Preserves the stored contentHash rather than recomputing it.
 */
export function parseFingerprint(data: unknown): RepoFingerprint {
  return RepoFingerprint.parse(data)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function hasDrifted(current: RepoFingerprint, baseline: RepoFingerprint): boolean {
  return current.contentHash !== baseline.contentHash
}

export function primaryLangSignal(fp: RepoFingerprint): LanguageSignal | undefined {
  return fp.languages.find((l) => l.primary)
}

export function frameworksByCategory(fp: RepoFingerprint, category: string): FrameworkSignal[] {
  return fp.frameworks.filter((f) => f.category === category)
}

export function allRuntimeDeps(fp: RepoFingerprint): Record<string, string> {
  return fp.dependencies.reduce<Record<string, string>>(
    (acc, d) => ({ ...acc, ...d.runtime }),
    {},
  )
}

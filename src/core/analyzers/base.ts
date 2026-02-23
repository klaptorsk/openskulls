/**
 * Base interface and abstract class for the analyzer plugin system.
 *
 * Analyzers are STATELESS PURE FUNCTIONS. They receive a read-only
 * AnalyzerContext and return an AnalyzerResult. They never write to disk,
 * never hold state, and are independently unit-testable.
 */

import type {
  ArchitectureSignal,
  CICDSignal,
  ConventionSignal,
  DependencyMap,
  FrameworkSignal,
  GitSignal,
  LanguageSignal,
  LintingSignal,
  RepoFingerprint,
  TestingSignal,
} from '../fingerprint/types.js'

// ─── Context ─────────────────────────────────────────────────────────────────

/**
 * Read-only snapshot of the repo, passed to every analyzer.
 * Built once by FingerprintCollector and shared across all analyzer runs.
 */
export interface AnalyzerContext {
  readonly repoRoot: string
  readonly fileTree: readonly string[]                // All non-excluded files (relative paths)
  readonly configFiles: ReadonlyMap<string, string>   // filename → absolute path
  readonly existingFingerprint: RepoFingerprint | null
}

// ─── Result ──────────────────────────────────────────────────────────────────

/**
 * The output of a single analyzer run.
 * Each field is a partial contribution to the final RepoFingerprint.
 * Leave fields undefined to contribute nothing for that signal type.
 */
export interface AnalyzerResult {
  readonly analyzerId: string
  readonly languages?: LanguageSignal[]
  readonly frameworks?: FrameworkSignal[]
  readonly conventions?: ConventionSignal[]
  readonly dependencies?: DependencyMap[]
  readonly testing?: TestingSignal
  readonly cicd?: CICDSignal
  readonly linting?: LintingSignal
  readonly architecturePatch?: Partial<ArchitectureSignal>
  readonly gitPatch?: Partial<GitSignal>
}

// ─── Interface ───────────────────────────────────────────────────────────────

export interface Analyzer {
  /** Unique identifier — used in AnalyzerResult.analyzerId */
  readonly id: string

  /**
   * Config filenames that must be present for this analyzer to run.
   * If the list is non-empty and none are found, canRun() returns false.
   */
  readonly triggerFiles: readonly string[]

  /**
   * Execution priority — lower values run first.
   * Language analyzers: 1–10
   * Framework analyzers: 20–40
   * Infrastructure analyzers: 50–70
   * Convention analyzers: 80–100
   */
  readonly priority: number

  canRun(ctx: AnalyzerContext): boolean

  /**
   * Run the analysis and return results.
   *
   * MUST be:
   *  - Pure: same inputs → same outputs, always
   *  - Stateless: no instance state read or written
   *  - Side-effect-free: no filesystem writes, no network calls
   *  - Idempotent: calling twice returns the same result
   */
  analyze(ctx: AnalyzerContext): AnalyzerResult
}

// ─── Abstract base ───────────────────────────────────────────────────────────

export abstract class BaseAnalyzer implements Analyzer {
  abstract readonly id: string
  readonly triggerFiles: readonly string[] = []
  readonly priority: number = 50

  canRun(ctx: AnalyzerContext): boolean {
    if (this.triggerFiles.length === 0) return true
    return this.triggerFiles.some((f) => ctx.configFiles.has(f))
  }

  abstract analyze(ctx: AnalyzerContext): AnalyzerResult
}

// ─── Context helpers ─────────────────────────────────────────────────────────

export function hasFile(ctx: AnalyzerContext, filename: string): boolean {
  return ctx.configFiles.has(filename)
}

export function hasAnyFile(ctx: AnalyzerContext, ...filenames: string[]): boolean {
  return filenames.some((f) => ctx.configFiles.has(f))
}

export function filePath(ctx: AnalyzerContext, filename: string): string | undefined {
  return ctx.configFiles.get(filename)
}

export function countFilesWithExtension(ctx: AnalyzerContext, ext: string): number {
  return ctx.fileTree.filter((f) => f.endsWith(ext)).length
}

export function filesWithExtension(ctx: AnalyzerContext, ext: string): string[] {
  return ctx.fileTree.filter((f) => f.endsWith(ext))
}

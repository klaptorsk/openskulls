/**
 * Base interface and abstract class for the generator plugin system.
 *
 * Generators are STATELESS PURE FUNCTIONS. They receive a GeneratorInput
 * and return an array of GeneratedFile objects. They NEVER write to disk.
 *
 * The write step belongs to the CLI layer. This separation enables:
 *  - Dry-run / analyze mode with no filesystem changes
 *  - Diff preview before any file is written
 *  - CI mode (exit codes without writing)
 *  - Unit-testable generators (assert on GeneratedFile[], no fs mocking needed)
 */

import { join } from 'node:path'
import type { GlobalConfig, ProjectConfig } from '../config/types.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import type { SkullPackage } from '../packages/types.js'

// ─── Generated file ───────────────────────────────────────────────────────────

export type MergeStrategy =
  | 'replace'          // Overwrite the file entirely
  | 'merge_sections'   // Regenerate only openskulls-tagged sections, preserve manual edits
  | 'append'           // Append content if not already present

export type FileBase =
  | 'repo'             // [repoRoot]/relativePath
  | 'home'             // ~/relativePath
  | 'global_claude'    // ~/.claude/relativePath

export interface GeneratedFile {
  readonly relativePath: string
  readonly content: string
  readonly base: FileBase
  readonly isGitignored: boolean
  readonly mergeStrategy: MergeStrategy
}

export function resolveFilePath(
  file: GeneratedFile,
  repoRoot: string,
  homeDir?: string,
): string {
  const home = homeDir ?? process.env['HOME'] ?? '~'
  switch (file.base) {
    case 'repo':
      return join(repoRoot, file.relativePath)
    case 'home':
      return join(home, file.relativePath)
    case 'global_claude':
      return join(home, '.claude', file.relativePath)
  }
}

// ─── Generator input ──────────────────────────────────────────────────────────

export interface GeneratorInput {
  readonly fingerprint: RepoFingerprint
  readonly installedPackages: readonly SkullPackage[]
  readonly projectConfig: ProjectConfig
  readonly globalConfig: GlobalConfig
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface Generator {
  /** Unique identifier — matches the tool name in ProjectConfig.targets */
  readonly toolId: string

  /** Human-readable name shown in the CLI */
  readonly toolName: string

  /**
   * Filenames/dirs whose presence signals this tool is being used.
   * Used during init to auto-detect and suggest this generator.
   */
  readonly detectionFiles: readonly string[]

  /**
   * Produce the list of files this generator would write.
   *
   * MUST be:
   *  - Pure: same inputs → same outputs, always
   *  - Stateless: no instance state read or written
   *  - Side-effect-free: no filesystem writes, no network calls
   */
  generate(input: GeneratorInput): GeneratedFile[]
}

// ─── Abstract base ────────────────────────────────────────────────────────────

export abstract class BaseGenerator implements Generator {
  abstract readonly toolId: string
  abstract readonly toolName: string
  readonly detectionFiles: readonly string[] = []

  abstract generate(input: GeneratorInput): GeneratedFile[]

  isDetected(configFiles: ReadonlyMap<string, string>): boolean {
    return this.detectionFiles.some((f) => configFiles.has(f))
  }
}

// ─── File builder helpers ─────────────────────────────────────────────────────

export function repoFile(
  relativePath: string,
  content: string,
  mergeStrategy: MergeStrategy = 'replace',
): GeneratedFile {
  return { relativePath, content, base: 'repo', isGitignored: false, mergeStrategy }
}

export function personalFile(
  relativePath: string,
  content: string,
  mergeStrategy: MergeStrategy = 'merge_sections',
): GeneratedFile {
  return { relativePath, content, base: 'global_claude', isGitignored: true, mergeStrategy }
}

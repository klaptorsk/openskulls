/**
 * Workspace auto-discovery for monorepo support.
 *
 * discoverWorkspaces() scans the repo tree up to maxDepth levels for
 * directories that contain a workspace manifest file (package.json,
 * go.mod, pyproject.toml, Cargo.toml, pom.xml, build.gradle).
 *
 * The repo root itself is never returned as a workspace (it is the
 * aggregate root). Declared entries in WorkspaceConfig can supplement
 * or replace discovered entries. Disabled entries are always excluded.
 */

import { readdir, stat } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import type { WorkspaceConfig, WorkspaceEntry } from '../config/types.js'

// ─── Manifest files that signal a workspace root ───────────────────────────────

export const WORKSPACE_MANIFEST_FILES = [
  'package.json',
  'go.mod',
  'pyproject.toml',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `dir` contains at least one workspace manifest file.
 */
export async function isWorkspaceRoot(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return WORKSPACE_MANIFEST_FILES.some((m) => entries.includes(m))
  } catch {
    return false
  }
}

/**
 * Returns true if `relPath` matches any of the given exclude patterns.
 * Patterns are simple path prefix matches (not full glob).
 */
function isExcluded(relPath: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) => {
    // Strip trailing /** or /* for prefix matching
    const prefix = pattern.replace(/\/\*+$/, '')
    return relPath === prefix || relPath.startsWith(prefix + '/')
  })
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Recursively scan `dir` for workspace roots up to `maxDepth` levels deep.
 * `repoRoot` is used to compute relative paths and is never included itself.
 */
async function scan(
  dir: string,
  repoRoot: string,
  currentDepth: number,
  maxDepth: number,
  excludePatterns: string[],
  results: WorkspaceEntry[],
): Promise<void> {
  if (currentDepth > maxDepth) return

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const absPath = join(dir, entry)
    const relPath = relative(repoRoot, absPath)

    // Skip hidden dirs, node_modules, common build dirs
    if (
      entry.startsWith('.') ||
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'build' ||
      entry === '__pycache__' ||
      entry === 'target' ||
      entry === '.git'
    ) continue

    if (isExcluded(relPath, excludePatterns)) continue

    let s
    try {
      s = await stat(absPath)
    } catch {
      continue
    }
    if (!s.isDirectory()) continue

    // If this directory is a workspace root, add it and don't recurse further
    if (await isWorkspaceRoot(absPath)) {
      results.push({
        path: relPath,
        name: basename(relPath),
        disabled: false,
      })
      // Don't recurse into workspace roots (avoid nested workspace detection)
      continue
    }

    // Otherwise recurse
    await scan(absPath, repoRoot, currentDepth + 1, maxDepth, excludePatterns, results)
  }
}

/**
 * Discover workspaces within `repoRoot` using the given `WorkspaceConfig`.
 *
 * - If `config.manual` is true, returns only declared (non-disabled) entries.
 * - Otherwise, auto-discovers AND merges with declared entries (declared entries
 *   can override or supplement discovered ones; disabled entries are removed).
 *
 * Returns an empty array if no workspaces are found (single-repo project).
 */
export async function discoverWorkspaces(
  repoRoot: string,
  config: WorkspaceConfig,
): Promise<WorkspaceEntry[]> {
  const declaredMap = new Map<string, WorkspaceEntry>()
  for (const entry of config.entries) {
    declaredMap.set(entry.path, entry)
  }

  const discovered: WorkspaceEntry[] = []

  if (!config.manual) {
    await scan(repoRoot, repoRoot, 1, config.maxDepth, config.excludePatterns, discovered)
  }

  // Merge: declared entries override discovered entries with the same path
  const merged = new Map<string, WorkspaceEntry>()
  for (const entry of discovered) {
    merged.set(entry.path, entry)
  }
  for (const [path, entry] of declaredMap) {
    merged.set(path, entry)
  }

  // Filter out disabled entries
  return [...merged.values()].filter((e) => !e.disabled)
}

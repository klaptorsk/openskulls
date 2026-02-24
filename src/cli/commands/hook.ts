/**
 * Git hook management for openskulls.
 *
 * Installs a post-commit hook that calls `openskulls sync --hook` after each
 * commit. The hook is idempotent and non-blocking (always exits 0).
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { basename } from 'node:path'

export const HOOK_MARKER = '# managed by openskulls'

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# Auto-generated — do not edit. Remove with: openskulls uninstall
command -v openskulls >/dev/null 2>&1 || exit 0
changed=$(git diff-tree --no-commit-id -r --name-only HEAD 2>/dev/null)
openskulls sync --hook --changed "$changed"
exit 0
`

/**
 * Writes .git/hooks/post-commit. Idempotent — skips if marker already present.
 */
export async function installGitHook(repoRoot: string): Promise<void> {
  const hookPath = join(repoRoot, '.git', 'hooks', 'post-commit')
  const hooksDir = join(repoRoot, '.git', 'hooks')

  await mkdir(hooksDir, { recursive: true })

  if (existsSync(hookPath)) {
    const existing = await readFile(hookPath, 'utf-8')
    if (existing.includes(HOOK_MARKER)) {
      return // already installed
    }
  }

  await writeFile(hookPath, HOOK_SCRIPT, 'utf-8')
  await chmod(hookPath, 0o755)
}

/**
 * Returns true if .git/hooks/post-commit contains HOOK_MARKER.
 */
export async function isHookInstalled(repoRoot: string): Promise<boolean> {
  const hookPath = join(repoRoot, '.git', 'hooks', 'post-commit')
  if (!existsSync(hookPath)) return false
  try {
    const content = await readFile(hookPath, 'utf-8')
    return content.includes(HOOK_MARKER)
  } catch {
    return false
  }
}

/**
 * Returns true if filePath matches a SyncConfig trigger pattern.
 *
 * Pattern rules (no external deps):
 *  - No `*` and no `/` → exact basename match (e.g. "package.json")
 *  - Ends with `/**`   → directory prefix match (e.g. ".github/workflows/**")
 *  - Otherwise         → glob-style match against basename using `*` → `.*`
 */
export function matchesTriggerPattern(filePath: string, pattern: string): boolean {
  const base = basename(filePath)

  // Exact filename match (no glob chars, no path separator)
  if (!pattern.includes('*') && !pattern.includes('/')) {
    return base === pattern
  }

  // Directory prefix match: ".github/workflows/**"
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return filePath.startsWith(prefix)
  }

  // Glob match against the full path (supports "*.lock", "requirements*.txt", etc.)
  const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  const re = new RegExp(regexStr)
  return re.test(base) || re.test(filePath)
}

/**
 * Returns true if any changed file matches any trigger pattern.
 */
export function shouldTriggerSync(changedFiles: string[], patterns: string[]): boolean {
  return changedFiles.some((file) =>
    patterns.some((pattern) => matchesTriggerPattern(file, pattern)),
  )
}

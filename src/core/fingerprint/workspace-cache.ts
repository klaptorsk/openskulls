/**
 * Per-workspace fingerprint cache.
 *
 * Each workspace stores its own .openskulls/fingerprint.json so sync
 * can detect drift at the workspace level independently.
 *
 * Mirrors the pattern from src/core/fingerprint/cache.ts exactly.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type RepoFingerprint, parseFingerprint } from './types.js'

const OPENSKULLS_DIR = '.openskulls'
const FINGERPRINT_FILE = 'fingerprint.json'

/**
 * Absolute path to the workspace fingerprint file.
 * workspacePath is relative to repoRoot (e.g. "packages/api").
 */
export function workspaceFingerprintPath(repoRoot: string, workspacePath: string): string {
  return join(repoRoot, workspacePath, OPENSKULLS_DIR, FINGERPRINT_FILE)
}

export async function loadWorkspaceFingerprint(
  repoRoot: string,
  workspacePath: string,
): Promise<RepoFingerprint | null> {
  try {
    const content = await readFile(workspaceFingerprintPath(repoRoot, workspacePath), 'utf-8')
    return parseFingerprint(JSON.parse(content))
  } catch {
    return null
  }
}

export async function saveWorkspaceFingerprint(
  repoRoot: string,
  workspacePath: string,
  fp: RepoFingerprint,
): Promise<void> {
  const path = workspaceFingerprintPath(repoRoot, workspacePath)
  await mkdir(join(repoRoot, workspacePath, OPENSKULLS_DIR), { recursive: true })
  await writeFile(path, JSON.stringify(fp, null, 2) + '\n', 'utf-8')
}

/**
 * Load fingerprints for all given workspace paths.
 * Returns a Map from workspacePath → fingerprint (null if not yet saved).
 */
export async function loadAllWorkspaceFingerprints(
  repoRoot: string,
  workspacePaths: string[],
): Promise<Map<string, RepoFingerprint | null>> {
  const results = await Promise.all(
    workspacePaths.map(async (p) => [p, await loadWorkspaceFingerprint(repoRoot, p)] as const),
  )
  return new Map(results)
}

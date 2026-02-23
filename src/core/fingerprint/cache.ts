/**
 * Fingerprint cache — persists the analysis baseline to
 * [repo]/.openskulls/fingerprint.json for drift detection.
 *
 * This file is committed to the repo so all team members share the same
 * baseline, and CI can run `openskulls audit` against it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type RepoFingerprint, parseFingerprint } from './types.js'

const OPENSKULLS_DIR = '.openskulls'
const FINGERPRINT_FILE = 'fingerprint.json'

export function fingerprintPath(repoRoot: string): string {
  return join(repoRoot, OPENSKULLS_DIR, FINGERPRINT_FILE)
}

export async function loadFingerprint(repoRoot: string): Promise<RepoFingerprint | null> {
  try {
    const content = await readFile(fingerprintPath(repoRoot), 'utf-8')
    return parseFingerprint(JSON.parse(content))
  } catch {
    return null
  }
}

export async function saveFingerprint(repoRoot: string, fp: RepoFingerprint): Promise<void> {
  const dir = join(repoRoot, OPENSKULLS_DIR)
  await mkdir(dir, { recursive: true })
  await writeFile(fingerprintPath(repoRoot), JSON.stringify(fp, null, 2) + '\n', 'utf-8')
}

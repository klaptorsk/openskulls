/**
 * Test context factory.
 *
 * Creates a real temp directory, writes files to it, and builds an
 * AnalyzerContext from the result. Cleanup is the caller's responsibility
 * (use afterEach or the returned cleanup function).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { AnalyzerContext } from '../../src/core/analyzers/base.js'

export interface TestFixture {
  ctx: AnalyzerContext
  dir: string
  cleanup: () => void
}

/**
 * Build an AnalyzerContext from a map of relative path → file content.
 *
 * @param files  Record<relativePath, content> — directories are created automatically.
 */
export function makeContext(files: Record<string, string>): TestFixture {
  const dir = mkdtempSync(join(tmpdir(), 'openskulls-test-'))

  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(dir, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }

  const fileTree = Object.keys(files)

  // configFiles: basename → absolute path (first win for duplicate basenames)
  const configFiles = new Map<string, string>()
  for (const relPath of fileTree) {
    const name = basename(relPath)
    if (!configFiles.has(name)) {
      configFiles.set(name, join(dir, relPath))
    }
  }

  const ctx: AnalyzerContext = {
    repoRoot: dir,
    fileTree,
    configFiles,
    existingFingerprint: null,
  }

  return {
    ctx,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/**
 * Tests for git hook installation and trigger pattern matching.
 */

import { statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOOK_MARKER,
  installGitHook,
  isHookInstalled,
  matchesTriggerPattern,
  shouldTriggerSync,
} from '../../src/cli/commands/hook.js'
import { makeContext } from '../helpers/index.js'

// ─── matchesTriggerPattern ────────────────────────────────────────────────────

describe('matchesTriggerPattern', () => {
  describe('exact filename match', () => {
    it('matches package.json', () => {
      expect(matchesTriggerPattern('package.json', 'package.json')).toBe(true)
      expect(matchesTriggerPattern('src/package.json', 'package.json')).toBe(true)
    })

    it('does not match other filenames', () => {
      expect(matchesTriggerPattern('package-lock.json', 'package.json')).toBe(false)
      expect(matchesTriggerPattern('mypackage.json', 'package.json')).toBe(false)
    })
  })

  describe('glob *.lock', () => {
    it('matches yarn.lock and pnpm-lock.yaml', () => {
      expect(matchesTriggerPattern('yarn.lock', '*.lock')).toBe(true)
      expect(matchesTriggerPattern('pnpm-lock.yaml', '*.lock')).toBe(false) // .yaml ≠ .lock
    })

    it('does not match package.json', () => {
      expect(matchesTriggerPattern('package.json', '*.lock')).toBe(false)
    })
  })

  describe('glob requirements*.txt', () => {
    it('matches requirements.txt and requirements-dev.txt', () => {
      expect(matchesTriggerPattern('requirements.txt', 'requirements*.txt')).toBe(true)
      expect(matchesTriggerPattern('requirements-dev.txt', 'requirements*.txt')).toBe(true)
    })
  })

  describe('directory glob .github/workflows/**', () => {
    it('matches .github/workflows/ci.yml', () => {
      expect(matchesTriggerPattern('.github/workflows/ci.yml', '.github/workflows/**')).toBe(true)
    })

    it('does not match .github/dependabot.yml', () => {
      expect(matchesTriggerPattern('.github/dependabot.yml', '.github/workflows/**')).toBe(false)
    })
  })
})

// ─── shouldTriggerSync ────────────────────────────────────────────────────────

describe('shouldTriggerSync', () => {
  const patterns = ['package.json', '*.lock', '.github/workflows/**']

  it('returns true when at least one file matches any pattern', () => {
    expect(shouldTriggerSync(['src/index.ts', 'package.json'], patterns)).toBe(true)
  })

  it('returns false when no file matches', () => {
    expect(shouldTriggerSync(['src/index.ts', 'README.md'], patterns)).toBe(false)
  })

  it('returns false for empty changed-file list', () => {
    expect(shouldTriggerSync([], patterns)).toBe(false)
  })
})

// ─── installGitHook / isHookInstalled ─────────────────────────────────────────

describe('installGitHook / isHookInstalled', () => {
  let cleanup: () => void

  afterEach(() => {
    cleanup?.()
  })

  async function makeGitDir(): Promise<{ dir: string; cleanup: () => void }> {
    const fixture = makeContext({})
    cleanup = fixture.cleanup
    // Create a fake .git/hooks directory to simulate a git repo
    await mkdir(join(fixture.dir, '.git', 'hooks'), { recursive: true })
    return { dir: fixture.dir, cleanup: fixture.cleanup }
  }

  it('writes post-commit hook containing HOOK_MARKER', async () => {
    const { dir } = await makeGitDir()
    await installGitHook(dir)

    const { readFile } = await import('node:fs/promises')
    const content = await readFile(join(dir, '.git', 'hooks', 'post-commit'), 'utf-8')
    expect(content).toContain(HOOK_MARKER)
    expect(content).toContain('openskulls sync --hook')
  })

  it('hook file is executable (mode & 0o111 !== 0)', async () => {
    const { dir } = await makeGitDir()
    await installGitHook(dir)

    const stats = statSync(join(dir, '.git', 'hooks', 'post-commit'))
    // eslint-disable-next-line no-bitwise
    expect(stats.mode & 0o111).not.toBe(0)
  })

  it('is idempotent — calling twice does not duplicate content', async () => {
    const { dir } = await makeGitDir()
    await installGitHook(dir)
    await installGitHook(dir)

    const { readFile } = await import('node:fs/promises')
    const content = await readFile(join(dir, '.git', 'hooks', 'post-commit'), 'utf-8')
    const markerCount = content.split(HOOK_MARKER).length - 1
    expect(markerCount).toBe(1)
  })

  it('isHookInstalled returns false when no hook file exists', async () => {
    const { dir } = await makeGitDir()
    expect(await isHookInstalled(dir)).toBe(false)
  })

  it('isHookInstalled returns false when hook exists but no marker', async () => {
    const { dir } = await makeGitDir()
    const hookPath = join(dir, '.git', 'hooks', 'post-commit')
    await writeFile(hookPath, '#!/bin/sh\necho hello\n', 'utf-8')
    expect(await isHookInstalled(dir)).toBe(false)
  })

  it('isHookInstalled returns true after installGitHook', async () => {
    const { dir } = await makeGitDir()
    await installGitHook(dir)
    expect(await isHookInstalled(dir)).toBe(true)
  })
})

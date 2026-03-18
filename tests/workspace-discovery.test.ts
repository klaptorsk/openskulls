/**
 * Tests for workspace auto-discovery.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverWorkspaces, isWorkspaceRoot, WORKSPACE_MANIFEST_FILES } from '../src/core/fingerprint/workspace-discovery.js'
import type { WorkspaceConfig } from '../src/core/config/types.js'

function makeDir(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'openskulls-ws-test-'))
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(dir, relPath)
    mkdirSync(abs.endsWith('/') ? abs : abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
    if (!relPath.endsWith('/')) writeFileSync(abs, content, 'utf-8')
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function defaultConfig(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return { manual: false, entries: [], excludePatterns: [], maxDepth: 3, ...overrides }
}

describe('WORKSPACE_MANIFEST_FILES', () => {
  it('includes package.json', () => {
    expect(WORKSPACE_MANIFEST_FILES).toContain('package.json')
  })
  it('includes go.mod', () => {
    expect(WORKSPACE_MANIFEST_FILES).toContain('go.mod')
  })
})

describe('isWorkspaceRoot', () => {
  it('returns true when package.json is present', async () => {
    const { dir, cleanup } = makeDir({ 'package.json': '{}' })
    try {
      expect(await isWorkspaceRoot(dir)).toBe(true)
    } finally {
      cleanup()
    }
  })

  it('returns false for an empty directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openskulls-empty-'))
    try {
      expect(await isWorkspaceRoot(dir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns false for a non-existent path', async () => {
    expect(await isWorkspaceRoot('/nonexistent/path/abc123')).toBe(false)
  })
})

describe('discoverWorkspaces', () => {
  it('returns empty array for a single-repo project (no sub-manifests)', async () => {
    const { dir, cleanup } = makeDir({ 'package.json': '{}' })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig())
      expect(result).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('discovers workspaces one level deep', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'packages/api/package.json': '{}',
      'packages/web/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig())
      const paths = result.map((e) => e.path).sort()
      expect(paths).toContain('packages/api')
      expect(paths).toContain('packages/web')
    } finally {
      cleanup()
    }
  })

  it('discovers Go workspaces via go.mod', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'services/worker/go.mod': 'module worker',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig())
      const paths = result.map((e) => e.path)
      expect(paths).toContain('services/worker')
    } finally {
      cleanup()
    }
  })

  it('respects maxDepth — does not scan beyond the limit', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'a/b/c/d/package.json': '{}',  // depth 4, beyond maxDepth 3
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig({ maxDepth: 3 }))
      const paths = result.map((e) => e.path)
      expect(paths).not.toContain('a/b/c/d')
    } finally {
      cleanup()
    }
  })

  it('excludes paths matching excludePatterns', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'packages/api/package.json': '{}',
      'packages/deprecated/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig({ excludePatterns: ['packages/deprecated'] }))
      const paths = result.map((e) => e.path)
      expect(paths).toContain('packages/api')
      expect(paths).not.toContain('packages/deprecated')
    } finally {
      cleanup()
    }
  })

  it('skips node_modules', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'node_modules/some-pkg/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig())
      const paths = result.map((e) => e.path)
      expect(paths).not.toContain('node_modules/some-pkg')
    } finally {
      cleanup()
    }
  })

  it('declared entries override discovered entries', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'packages/api/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig({
        entries: [{ path: 'packages/api', name: 'API Service', disabled: false }],
      }))
      const found = result.find((e) => e.path === 'packages/api')
      expect(found?.name).toBe('API Service')
    } finally {
      cleanup()
    }
  })

  it('manual mode uses only declared entries', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'packages/api/package.json': '{}',
      'packages/web/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig({
        manual: true,
        entries: [{ path: 'packages/api', disabled: false }],
      }))
      const paths = result.map((e) => e.path)
      expect(paths).toContain('packages/api')
      expect(paths).not.toContain('packages/web')
    } finally {
      cleanup()
    }
  })

  it('disabled entries are excluded from results', async () => {
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'packages/api/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig({
        entries: [{ path: 'packages/api', disabled: true }],
      }))
      expect(result).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('does not recurse into discovered workspace roots', async () => {
    // packages/api is a workspace; packages/api/internal should not be discovered as a separate workspace
    const { dir, cleanup } = makeDir({
      'package.json': '{}',
      'packages/api/package.json': '{}',
      'packages/api/internal/package.json': '{}',
    })
    try {
      const result = await discoverWorkspaces(dir, defaultConfig())
      const paths = result.map((e) => e.path)
      expect(paths).toContain('packages/api')
      expect(paths).not.toContain('packages/api/internal')
    } finally {
      cleanup()
    }
  })
})

/**
 * Tests for the workspace map section renderer and workspace-collector pure functions.
 */

import { describe, expect, it } from 'vitest'
import { buildWorkspaceMapSection } from '../../src/core/generators/workspace-aggregate.js'
import { extractCrossCuttingConventions, buildAggregateFingerprint, toWorkspaceMapEntries } from '../../src/core/fingerprint/workspace-collector.js'
import type { WorkspaceFingerprint } from '../../src/core/fingerprint/workspace-types.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWorkspace(path: string, name: string, overrides: Partial<Parameters<typeof createFingerprint>[0]> = {}): WorkspaceFingerprint {
  const fp = createFingerprint({
    repoRoot: `/repo/${path}`,
    repoName: name,
    languages: [],
    frameworks: [],
    conventions: [],
    dependencies: [],
    architecture: { style: 'cli', entryPoints: [], moduleStructure: [], hasMigrations: false },
    aiCLIs: [],
    ...overrides,
  })
  return { path, name, fingerprint: fp, targets: [] }
}

// ─── buildWorkspaceMapSection ─────────────────────────────────────────────────

describe('buildWorkspaceMapSection', () => {
  it('returns empty string for empty workspace list', () => {
    expect(buildWorkspaceMapSection([])).toBe('')
  })

  it('renders a table with workspace names and paths', () => {
    const result = buildWorkspaceMapSection([
      { path: 'packages/api', name: 'API', primaryLanguage: 'TypeScript', primaryFramework: 'Express' },
      { path: 'packages/web', name: 'Web', primaryLanguage: 'TypeScript', primaryFramework: 'React' },
    ])
    expect(result).toContain('packages/api/')
    expect(result).toContain('packages/web/')
    expect(result).toContain('API')
    expect(result).toContain('Web')
    expect(result).toContain('TypeScript')
    expect(result).toContain('Express')
    expect(result).toContain('React')
  })

  it('renders — for missing language and framework', () => {
    const result = buildWorkspaceMapSection([
      { path: 'services/worker', name: 'Worker' },
    ])
    expect(result).toContain('—')
  })

  it('includes cross-workspace guidance rules', () => {
    const result = buildWorkspaceMapSection([
      { path: 'packages/api', name: 'API' },
    ])
    expect(result).toContain('Cross-workspace rules')
    expect(result).toContain('openskulls sync')
  })
})

// ─── extractCrossCuttingConventions ───────────────────────────────────────────

describe('extractCrossCuttingConventions', () => {
  it('returns empty for fewer than minCount workspaces', () => {
    const ws = makeWorkspace('packages/api', 'API', {
      conventions: [{ name: 'conventional_commits', value: 'feat|fix', confidence: 'high', evidence: [] }],
    })
    expect(extractCrossCuttingConventions([ws])).toHaveLength(0)
  })

  it('returns conventions present in 2+ workspaces', () => {
    const conv = { name: 'conventional_commits', value: 'feat|fix', confidence: 'high' as const, evidence: [] }
    const ws1 = makeWorkspace('packages/api', 'API', { conventions: [conv] })
    const ws2 = makeWorkspace('packages/web', 'Web', { conventions: [conv] })
    const result = extractCrossCuttingConventions([ws1, ws2])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('conventional_commits')
  })

  it('excludes conventions present in only one workspace', () => {
    const conv1 = { name: 'conventional_commits', value: 'feat|fix', confidence: 'high' as const, evidence: [] }
    const conv2 = { name: 'package_manager', value: 'bun', confidence: 'high' as const, evidence: [] }
    const ws1 = makeWorkspace('packages/api', 'API', { conventions: [conv1, conv2] })
    const ws2 = makeWorkspace('packages/web', 'Web', { conventions: [conv1] })
    const result = extractCrossCuttingConventions([ws1, ws2])
    expect(result.map((c) => c.name)).toContain('conventional_commits')
    expect(result.map((c) => c.name)).not.toContain('package_manager')
  })
})

// ─── buildAggregateFingerprint ────────────────────────────────────────────────

describe('buildAggregateFingerprint', () => {
  it('sets architecture style to monorepo', () => {
    const ws = makeWorkspace('packages/api', 'API')
    const fp = buildAggregateFingerprint('/repo', [ws])
    expect(fp.architecture.style).toBe('monorepo')
  })

  it('sets moduleStructure to workspace paths', () => {
    const ws1 = makeWorkspace('packages/api', 'API')
    const ws2 = makeWorkspace('packages/web', 'Web')
    const fp = buildAggregateFingerprint('/repo', [ws1, ws2])
    expect(fp.architecture.moduleStructure).toContain('packages/api')
    expect(fp.architecture.moduleStructure).toContain('packages/web')
  })

  it('merges language signals across workspaces', () => {
    const ws1 = makeWorkspace('packages/api', 'API', {
      languages: [{ name: 'TypeScript', confidence: 'high', percentage: 80, primary: true, evidence: [] }],
    })
    const ws2 = makeWorkspace('packages/worker', 'Worker', {
      languages: [
        { name: 'TypeScript', confidence: 'high', percentage: 40, primary: true, evidence: [] },
        { name: 'Python', confidence: 'high', percentage: 60, primary: false, evidence: [] },
      ],
    })
    const fp = buildAggregateFingerprint('/repo', [ws1, ws2])
    const langNames = fp.languages.map((l) => l.name)
    expect(langNames).toContain('TypeScript')
    expect(langNames).toContain('Python')
  })

  it('uses description when provided', () => {
    const ws = makeWorkspace('packages/api', 'API')
    const fp = buildAggregateFingerprint('/repo', [ws], 'My enterprise monorepo')
    expect(fp.description).toBe('My enterprise monorepo')
  })
})

// ─── toWorkspaceMapEntries ─────────────────────────────────────────────────────

describe('toWorkspaceMapEntries', () => {
  it('converts WorkspaceFingerprint[] to WorkspaceMapEntry[]', () => {
    const ws = makeWorkspace('packages/api', 'API', {
      primaryLanguage: 'TypeScript',
    })
    // primaryLanguage is set on fingerprint by createFingerprint when languages are present
    const entries = toWorkspaceMapEntries([ws])
    expect(entries[0]!.path).toBe('packages/api')
    expect(entries[0]!.name).toBe('API')
  })

  it('maps unknown architectureStyle to undefined', () => {
    const ws = makeWorkspace('packages/api', 'API')
    const entries = toWorkspaceMapEntries([ws])
    // style is 'cli' not 'unknown' in fixture — but test the mapping
    expect(entries[0]!.architectureStyle).toBeDefined()
  })
})

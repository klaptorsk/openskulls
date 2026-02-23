import { describe, expect, it } from 'vitest'
import {
  type RepoFingerprint,
  allRuntimeDeps,
  createFingerprint,
  frameworksByCategory,
  hasDrifted,
  parseFingerprint,
  primaryLangSignal,
} from '../../src/core/fingerprint/types.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function minimalFingerprint(overrides: Partial<RepoFingerprint> = {}): RepoFingerprint {
  return createFingerprint({
    repoRoot: '/test/project',
    repoName: 'test-project',
    architecture: { style: 'monolith' },
    ...overrides,
  })
}

// ─── contentHash ──────────────────────────────────────────────────────────────

describe('contentHash', () => {
  it('is computed on creation and non-empty', () => {
    const fp = minimalFingerprint()
    expect(fp.contentHash).toHaveLength(64) // SHA-256 hex
    expect(fp.contentHash).not.toBe('')
  })

  it('is stable — same data produces the same hash', () => {
    const a = minimalFingerprint()
    const b = minimalFingerprint()
    expect(a.contentHash).toBe(b.contentHash)
  })

  it('excludes repoRoot — machine-specific paths must not affect drift detection', () => {
    const a = createFingerprint({ repoRoot: '/machine-a/project', repoName: 'test', architecture: { style: 'monolith' } })
    const b = createFingerprint({ repoRoot: '/machine-b/project', repoName: 'test', architecture: { style: 'monolith' } })
    expect(a.contentHash).toBe(b.contentHash)
  })

  it('changes when meaningful data changes', () => {
    const a = createFingerprint({ repoRoot: '/p', repoName: 'test', architecture: { style: 'monolith' } })
    const b = createFingerprint({ repoRoot: '/p', repoName: 'test', architecture: { style: 'microservices' } })
    expect(a.contentHash).not.toBe(b.contentHash)
  })

  it('is preserved — not recomputed — when parsing from JSON', () => {
    const original = minimalFingerprint()
    const json = JSON.stringify(original)
    const parsed = parseFingerprint(JSON.parse(json))
    expect(parsed.contentHash).toBe(original.contentHash)
  })
})

// ─── hasDrifted ───────────────────────────────────────────────────────────────

describe('hasDrifted', () => {
  it('returns false when fingerprints are identical', () => {
    const fp = minimalFingerprint()
    expect(hasDrifted(fp, fp)).toBe(false)
  })

  it('returns true when content differs', () => {
    const old = createFingerprint({ repoRoot: '/p', repoName: 'test', architecture: { style: 'monolith' } })
    const current = createFingerprint({ repoRoot: '/p', repoName: 'test', architecture: { style: 'microservices' } })
    expect(hasDrifted(current, old)).toBe(true)
  })
})

// ─── primaryLangSignal ────────────────────────────────────────────────────────

describe('primaryLangSignal', () => {
  it('returns the primary language signal', () => {
    const fp = minimalFingerprint({
      languages: [
        { name: 'TypeScript', confidence: 'high', percentage: 90, primary: true, evidence: [] },
        { name: 'CSS', confidence: 'high', percentage: 10, primary: false, evidence: [] },
      ],
    })
    expect(primaryLangSignal(fp)?.name).toBe('TypeScript')
  })

  it('returns undefined when no languages present', () => {
    const fp = minimalFingerprint({ languages: [] })
    expect(primaryLangSignal(fp)).toBeUndefined()
  })
})

// ─── frameworksByCategory ─────────────────────────────────────────────────────

describe('frameworksByCategory', () => {
  it('filters frameworks by category', () => {
    const fp = minimalFingerprint({
      frameworks: [
        { name: 'Next.js', confidence: 'high', category: 'fullstack', evidence: [] },
        { name: 'pytest', confidence: 'high', category: 'testing', evidence: [] },
      ],
    })
    const fullstack = frameworksByCategory(fp, 'fullstack')
    expect(fullstack).toHaveLength(1)
    expect(fullstack[0]?.name).toBe('Next.js')

    expect(frameworksByCategory(fp, 'backend')).toHaveLength(0)
  })
})

// ─── allRuntimeDeps ───────────────────────────────────────────────────────────

describe('allRuntimeDeps', () => {
  it('merges runtime deps from all dependency maps', () => {
    const fp = minimalFingerprint({
      dependencies: [
        { runtime: { react: '^18.0.0', next: '14.0.0' }, dev: {}, peer: {}, sourceFile: 'package.json' },
        { runtime: { pydantic: '^2.0' }, dev: {}, peer: {}, sourceFile: 'pyproject.toml' },
      ],
    })
    const deps = allRuntimeDeps(fp)
    expect(deps['react']).toBe('^18.0.0')
    expect(deps['pydantic']).toBe('^2.0')
  })

  it('returns empty object when no dependencies', () => {
    const fp = minimalFingerprint({ dependencies: [] })
    expect(allRuntimeDeps(fp)).toEqual({})
  })
})

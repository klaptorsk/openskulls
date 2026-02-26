import { describe, expect, it } from 'vitest'
import {
  type RepoFingerprint,
  createFingerprint,
  hasDrifted,
  parseFingerprint,
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


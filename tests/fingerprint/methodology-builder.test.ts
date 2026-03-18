import { describe, expect, it } from 'vitest'
import { buildMethodologyPrompt } from '../../src/core/fingerprint/methodology-prompt.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'
import { MethodologySkillsResponse } from '../../src/core/fingerprint/methodology-builder.js'

function makeFingerprint(
  overrides: Partial<Parameters<typeof createFingerprint>[0]> = {},
) {
  return createFingerprint({
    repoRoot: '/tmp/test-repo',
    repoName: 'test-repo',
    ...overrides,
  })
}

describe('buildMethodologyPrompt', () => {
  it('includes project name', () => {
    const fp = makeFingerprint({ repoName: 'my-app' })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('my-app')
  })

  it('includes module structure', () => {
    const fp = makeFingerprint({
      architecture: {
        style: 'cli',
        entryPoints: ['src/index.ts'],
        moduleStructure: ['src/core/', 'src/cli/', 'src/utils/'],
        hasMigrations: false,
      },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('src/core/')
    expect(prompt).toContain('src/cli/')
  })

  it('includes entry points', () => {
    const fp = makeFingerprint({
      architecture: {
        style: 'cli',
        entryPoints: ['src/main.ts'],
        moduleStructure: [],
        hasMigrations: false,
      },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('src/main.ts')
  })

  it('includes testing info when present', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('vitest')
    expect(prompt).toContain('tdd')
  })

  it('omits tdd section when no testing detected', () => {
    const fp = makeFingerprint()
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).not.toContain('"tdd"')
  })

  it('includes installed pack skill IDs for deduplication', () => {
    const fp = makeFingerprint()
    const prompt = buildMethodologyPrompt(fp, undefined, ['add-component', 'review-pr'])
    expect(prompt).toContain('add-component')
    expect(prompt).toContain('review-pr')
  })

  it('includes task skill IDs when provided', () => {
    const fp = makeFingerprint()
    const prompt = buildMethodologyPrompt(fp, undefined, undefined, ['add-api', 'write-test'])
    expect(prompt).toContain('add-api')
    expect(prompt).toContain('write-test')
  })

  it('includes conventions', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'conventional_commits', value: 'true', confidence: 'high', evidence: [] },
      ],
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('conventional_commits')
  })

  it('includes git info when present', () => {
    const fp = makeFingerprint({
      git: { commitStyle: 'conventional_commits', branchStrategy: 'github_flow', primaryBranch: 'main', contributorsCount: 3 },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('conventional_commits')
    expect(prompt).toContain('main')
  })

  it('is deterministic', () => {
    const fp = makeFingerprint({ repoName: 'deterministic' })
    expect(buildMethodologyPrompt(fp)).toBe(buildMethodologyPrompt(fp))
  })
})

describe('MethodologySkillsResponse schema', () => {
  it('parses a valid response', () => {
    const data = {
      skills: [{
        id: 'architect',
        title: 'Architecture Guide',
        description: 'Use when placing new code.',
        content: '# Architecture Guide\n\n## Core Rules\n\n- Rule 1',
        category: 'methodology',
      }],
    }
    const result = MethodologySkillsResponse.parse(data)
    expect(result.skills).toHaveLength(1)
  })

  it('defaults skills to empty array', () => {
    const result = MethodologySkillsResponse.parse({})
    expect(result.skills).toEqual([])
  })

  it('rejects invalid methodology skill id', () => {
    expect(() => MethodologySkillsResponse.parse({
      skills: [{
        id: 'not-a-valid-methodology-id',
        title: 'X',
        description: 'X',
        content: 'X',
        category: 'methodology',
      }],
    })).toThrow()
  })
})

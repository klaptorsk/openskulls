/**
 * Tests for skills-prompt.ts and skills-builder.ts (Zod schemas).
 *
 * Pure function and schema tests only — no subprocess mocking needed.
 */

import { describe, expect, it } from 'vitest'
import { buildSkillsPrompt } from '../../src/core/fingerprint/skills-prompt.js'
import { AISkill, AISkillsResponse } from '../../src/core/fingerprint/skills-builder.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeFingerprint(
  overrides: Partial<Parameters<typeof createFingerprint>[0]> = {},
): ReturnType<typeof createFingerprint> {
  return createFingerprint({
    repoRoot: '/tmp/test-repo',
    repoName: 'test-repo',
    ...overrides,
  })
}

function makeValidSkill(overrides: Partial<{ id: string; title: string; description: string; content: string; category: string }> = {}) {
  return {
    id: 'add-feature',
    title: 'Add a Feature',
    description: 'Use when adding a new feature. Triggers: new feature, implementation.',
    content: '# Add a Feature\n\n## Core Rules\n\n- Follow existing patterns\n\n## Anti-Patterns\n\n- Do not skip tests\n\n## Checklist\n\n- [ ] Tests pass',
    category: 'workflow',
    ...overrides,
  }
}

// ─── buildSkillsPrompt ───────────────────────────────────────────────────────

describe('buildSkillsPrompt', () => {
  it('includes the project name', () => {
    const fp = makeFingerprint({ repoName: 'my-cool-app' })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('my-cool-app')
  })

  it('includes primary language when present', () => {
    const fp = makeFingerprint({ primaryLanguage: 'TypeScript' })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('TypeScript')
  })

  it('includes primary framework when present', () => {
    const fp = makeFingerprint({ primaryFramework: 'Next.js' })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('Next.js')
  })

  it('includes description when present', () => {
    const fp = makeFingerprint({ description: 'A CLI tool for developers' })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('A CLI tool for developers')
  })

  it('includes detected frameworks', () => {
    const fp = makeFingerprint({
      frameworks: [
        { name: 'React', version: '18.0.0', confidence: 'high', category: 'frontend', evidence: [] },
        { name: 'Express', confidence: 'medium', category: 'backend', evidence: [] },
      ],
    })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('React')
    expect(prompt).toContain('Express')
  })

  it('includes testing framework', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('vitest')
  })

  it('includes linting tools', () => {
    const fp = makeFingerprint({
      linting: { tools: ['eslint', 'prettier'], configFiles: [], styleRules: {} },
    })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('eslint')
    expect(prompt).toContain('prettier')
  })

  it('includes architecture style when not unknown', () => {
    const fp = makeFingerprint({
      architecture: { style: 'cli', entryPoints: [], moduleStructure: [], hasMigrations: false },
    })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('cli')
  })

  it('includes conventions with values', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'package_manager', value: 'bun', confidence: 'high', evidence: [] },
        { name: 'no_value_signal', confidence: 'low', evidence: [] },
      ],
    })
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('package_manager=bun')
    expect(prompt).not.toContain('no_value_signal')
  })

  it('instructs AI to avoid reserved skill ids', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('run-tests')
    expect(prompt).toContain('commit')
  })

  it('lists all valid category values in the prompt', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('workflow')
    expect(prompt).toContain('testing')
    expect(prompt).toContain('debugging')
    expect(prompt).toContain('refactoring')
    expect(prompt).toContain('documentation')
    expect(prompt).toContain('devops')
    expect(prompt).toContain('other')
  })

  it('instructs AI to return only JSON', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('Return only the JSON object')
  })

  it('instructs AI to use Core Rules section', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('Core Rules')
  })

  it('instructs AI to use Anti-Patterns section', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('Anti-Patterns')
  })

  it('instructs AI to use a Checklist section', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('Checklist')
  })

  it('instructs AI to generate content as a rich reference document', () => {
    const fp = makeFingerprint()
    const prompt = buildSkillsPrompt(fp)
    expect(prompt).toContain('content')
    expect(prompt).toContain('SKILL.md')
  })

  it('is deterministic — same input produces same output', () => {
    const fp = makeFingerprint({
      repoName: 'deterministic-test',
      primaryLanguage: 'TypeScript',
    })
    expect(buildSkillsPrompt(fp)).toBe(buildSkillsPrompt(fp))
  })
})

// ─── AISkill schema ───────────────────────────────────────────────────────────

describe('AISkill schema', () => {
  it('parses a valid skill', () => {
    const result = AISkill.parse(makeValidSkill())
    expect(result.id).toBe('add-feature')
    expect(result.title).toBe('Add a Feature')
    expect(result.category).toBe('workflow')
  })

  it('accepts all valid categories', () => {
    const categories = ['workflow', 'testing', 'debugging', 'refactoring', 'documentation', 'devops', 'methodology', 'process', 'security', 'other'] as const
    for (const category of categories) {
      expect(() => AISkill.parse(makeValidSkill({ category }))).not.toThrow()
    }
  })

  it('accepts methodology categories', () => {
    const methodologyCategories = ['methodology', 'process', 'security'] as const
    for (const category of methodologyCategories) {
      expect(() => AISkill.parse(makeValidSkill({ category }))).not.toThrow()
    }
  })

  it('rejects an invalid category', () => {
    expect(() => AISkill.parse(makeValidSkill({ category: 'invalid-category' }))).toThrow()
  })

  it('rejects an id with spaces', () => {
    expect(() => AISkill.parse(makeValidSkill({ id: 'has spaces' }))).toThrow()
  })

  it('rejects an id with uppercase letters', () => {
    expect(() => AISkill.parse(makeValidSkill({ id: 'MySkill' }))).toThrow()
  })

  it('accepts ids with hyphens and numbers', () => {
    expect(() => AISkill.parse(makeValidSkill({ id: 'add-api-endpoint-v2' }))).not.toThrow()
  })

  it('rejects missing required fields', () => {
    expect(() => AISkill.parse({ id: 'my-skill' })).toThrow()
  })

  it('parses content field correctly', () => {
    const result = AISkill.parse(makeValidSkill())
    expect(result.content).toContain('# Add a Feature')
  })

  it('rejects missing content field', () => {
    const { content: _, ...withoutContent } = makeValidSkill()
    expect(() => AISkill.parse(withoutContent)).toThrow()
  })
})

// ─── AISkillsResponse schema ──────────────────────────────────────────────────

describe('AISkillsResponse schema', () => {
  it('parses a valid response with skills', () => {
    const data = {
      skills: [makeValidSkill(), makeValidSkill({ id: 'write-test', title: 'Write a Test', category: 'testing' })],
    }
    const result = AISkillsResponse.parse(data)
    expect(result.skills).toHaveLength(2)
  })

  it('defaults skills to empty array when omitted', () => {
    const result = AISkillsResponse.parse({})
    expect(result.skills).toEqual([])
  })

  it('defaults skills to empty array when key is missing', () => {
    const result = AISkillsResponse.parse({ unrelated: 'field' })
    expect(result.skills).toEqual([])
  })

  it('rejects a skill with an invalid id within the array', () => {
    const data = {
      skills: [makeValidSkill({ id: 'UPPERCASE_NOT_ALLOWED' })],
    }
    expect(() => AISkillsResponse.parse(data)).toThrow()
  })

  it('rejects a skill with an invalid category within the array', () => {
    const data = {
      skills: [makeValidSkill({ category: 'not-a-category' })],
    }
    expect(() => AISkillsResponse.parse(data)).toThrow()
  })
})

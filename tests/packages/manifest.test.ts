import { describe, expect, it } from 'vitest'
import { InstalledPackEntry } from '../../src/core/packages/types.js'
import { SkullPackManifest, ManifestSkillEntry, ManifestRuleEntry } from '../../src/core/packages/manifest.js'

describe('InstalledPackEntry schema', () => {
  it('parses a valid github entry', () => {
    const result = InstalledPackEntry.parse({
      name: 'react-patterns',
      source: 'github',
      sourceUrl: 'github:user/react-patterns#v1.0.0',
      installedAt: '2026-03-17T00:00:00Z',
    })
    expect(result.name).toBe('react-patterns')
    expect(result.source).toBe('github')
  })

  it('parses a valid local entry', () => {
    const result = InstalledPackEntry.parse({
      name: 'my-pack',
      source: 'local',
      sourceUrl: '../local/path',
      installedAt: '2026-03-17T00:00:00Z',
    })
    expect(result.source).toBe('local')
  })

  it('rejects an invalid source', () => {
    expect(() => InstalledPackEntry.parse({
      name: 'x',
      source: 'npm',
      sourceUrl: 'x',
      installedAt: 'x',
    })).toThrow()
  })

  it('requires all fields', () => {
    expect(() => InstalledPackEntry.parse({ name: 'x' })).toThrow()
  })
})

describe('ManifestSkillEntry schema', () => {
  it('parses a valid skill entry', () => {
    const result = ManifestSkillEntry.parse({
      id: 'add-component',
      path: 'skills/add-component/SKILL.md',
      category: 'workflow',
      tool_compatibility: [],
    })
    expect(result.id).toBe('add-component')
  })

  it('rejects id with uppercase', () => {
    expect(() => ManifestSkillEntry.parse({
      id: 'AddComponent',
      path: 'skills/x.md',
    })).toThrow()
  })

  it('defaults category to workflow', () => {
    const result = ManifestSkillEntry.parse({ id: 'test-skill', path: 'x.md' })
    expect(result.category).toBe('workflow')
  })

  it('defaults tool_compatibility to empty', () => {
    const result = ManifestSkillEntry.parse({ id: 'test-skill', path: 'x.md' })
    expect(result.tool_compatibility).toEqual([])
  })
})

describe('ManifestRuleEntry schema', () => {
  it('parses a valid rule entry', () => {
    const result = ManifestRuleEntry.parse({
      id: 'no-class-components',
      path: 'rules/no-class.md',
    })
    expect(result.section).toBe('codeStyle')
    expect(result.severity).toBe('warn')
  })
})

describe('SkullPackManifest schema', () => {
  it('parses a complete manifest', () => {
    const result = SkullPackManifest.parse({
      schema_version: '1.0.0',
      name: 'react-patterns',
      description: 'React conventions',
      author: 'someone',
      tags: ['react'],
      applies_when: { frameworks: ['react'], languages: ['typescript'] },
      skills: [{ id: 'add-component', path: 'skills/add-component/SKILL.md' }],
      rules: [{ id: 'no-class', path: 'rules/no-class.md' }],
    })
    expect(result.name).toBe('react-patterns')
    expect(result.skills).toHaveLength(1)
    expect(result.rules).toHaveLength(1)
  })

  it('parses a minimal manifest (name + description only)', () => {
    const result = SkullPackManifest.parse({
      name: 'minimal-pack',
      description: 'A minimal pack',
    })
    expect(result.skills).toEqual([])
    expect(result.rules).toEqual([])
    expect(result.tags).toEqual([])
  })

  it('rejects missing name', () => {
    expect(() => SkullPackManifest.parse({ description: 'x' })).toThrow()
  })

  it('rejects missing description', () => {
    expect(() => SkullPackManifest.parse({ name: 'x' })).toThrow()
  })
})

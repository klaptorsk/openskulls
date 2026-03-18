import { describe, expect, it } from 'vitest'
import { ClaudeCodeGenerator } from '../../src/core/generators/claude-code.js'
import type { GeneratorInput } from '../../src/core/generators/base.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'
import { defaultProjectConfig, defaultGlobalConfig } from '../../src/core/config/types.js'
import type { SkullPackage } from '../../src/core/packages/types.js'

function makeInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    fingerprint: createFingerprint({ repoRoot: '/tmp/test', repoName: 'test' }),
    installedPackages: [],
    projectConfig: defaultProjectConfig(),
    globalConfig: defaultGlobalConfig(),
    ...overrides,
  }
}

function makePack(partial: Partial<SkullPackage>): SkullPackage {
  return {
    schemaVersion: '1.0.0',
    name: '@test/pkg',
    version: '1.0.0',
    description: 'Test',
    tags: [],
    appliesWhen: { frameworks: [], languages: [] },
    skills: [],
    rules: [],
    contextSections: {},
    dependencies: [],
    peerDependencies: [],
    ...partial,
  }
}

const gen = new ClaudeCodeGenerator()

describe('ClaudeCodeGenerator pack skill emission', () => {
  it('emits pack skills as .claude/skills/<pack>-<id>/SKILL.md', () => {
    const input = makeInput({
      installedPackages: [makePack({
        name: 'react-patterns',
        skills: [{
          id: 'add-component',
          name: 'add-component',
          description: 'Add a React component',
          content: '# Add Component\n\nContent here.',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        }],
      })],
    })
    const files = gen.generate(input)
    const packSkill = files.find((f) => f.relativePath.includes('react-patterns-add-component'))
    expect(packSkill).toBeDefined()
    expect(packSkill!.relativePath).toBe('.claude/skills/react-patterns-add-component/SKILL.md')
    expect(packSkill!.content).toContain('# Add Component')
  })

  it('does not emit extra skill files when no packs installed', () => {
    const input = makeInput()
    const files = gen.generate(input)
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/') && f.relativePath.endsWith('/SKILL.md'))
    expect(skillFiles).toHaveLength(0)
  })

  it('filters pack skills by tool compatibility', () => {
    const input = makeInput({
      installedPackages: [makePack({
        name: 'cursor-only',
        skills: [{
          id: 'cursor-skill',
          name: 'cursor-skill',
          description: 'Cursor only',
          content: '# Cursor',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: ['cursor'],
        }],
      })],
    })
    const files = gen.generate(input)
    const packSkill = files.find((f) => f.relativePath.includes('cursor-only-cursor-skill'))
    expect(packSkill).toBeUndefined()
  })
})

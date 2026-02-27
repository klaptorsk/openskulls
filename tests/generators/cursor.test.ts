/**
 * Tests for CursorGenerator and buildCursorRule.
 *
 * The generator is pure: same GeneratorInput → same GeneratedFile[].
 * No filesystem writes in generate(); tests need no temp dirs.
 */

import { describe, expect, it } from 'vitest'
import { CursorGenerator, buildCursorRule } from '../../src/core/generators/cursor.js'
import type { GeneratorInput } from '../../src/core/generators/base.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'
import { defaultProjectConfig, defaultGlobalConfig, type WorkflowConfig } from '../../src/core/config/types.js'

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

function makeInput(
  overrides: Partial<GeneratorInput> = {},
): GeneratorInput {
  return {
    fingerprint: makeFingerprint(),
    installedPackages: [],
    projectConfig: defaultProjectConfig(),
    globalConfig: defaultGlobalConfig(),
    ...overrides,
  }
}

const gen = new CursorGenerator()

// ─── Generator metadata ───────────────────────────────────────────────────────

describe('CursorGenerator metadata', () => {
  it('has the right toolId and toolName', () => {
    expect(gen.toolId).toBe('cursor')
    expect(gen.toolName).toBe('Cursor')
  })

  it('detects via .cursor/rules/project.mdc', () => {
    const configFiles = new Map([['.cursor/rules/project.mdc', '...']])
    expect(gen.isDetected(configFiles)).toBe(true)
  })

  it('detects via legacy .cursorrules', () => {
    const configFiles = new Map([['.cursorrules', '...']])
    expect(gen.isDetected(configFiles)).toBe(true)
  })

  it('is not detected when detection files are absent', () => {
    const configFiles = new Map([['CLAUDE.md', '...']])
    expect(gen.isDetected(configFiles)).toBe(false)
  })
})

// ─── Generated file shape ─────────────────────────────────────────────────────

describe('CursorGenerator file shape', () => {
  it('produces exactly one file', () => {
    const files = gen.generate(makeInput())
    expect(files).toHaveLength(1)
  })

  it('writes to .cursor/rules/project.mdc', () => {
    const files = gen.generate(makeInput())
    expect(files[0]!.relativePath).toBe('.cursor/rules/project.mdc')
  })

  it('uses merge_sections strategy', () => {
    const files = gen.generate(makeInput())
    expect(files[0]!.mergeStrategy).toBe('merge_sections')
  })

  it('has repo base, not gitignored', () => {
    const files = gen.generate(makeInput())
    expect(files[0]!.base).toBe('repo')
    expect(files[0]!.isGitignored).toBe(false)
  })
})

// ─── Frontmatter ──────────────────────────────────────────────────────────────

describe('buildCursorRule — frontmatter', () => {
  it('includes YAML frontmatter block', () => {
    const content = buildCursorRule(makeFingerprint())
    expect(content).toMatch(/^---\n/)
    expect(content).toContain('alwaysApply: true')
    expect(content).toContain('description:')
  })

  it('closes frontmatter before content', () => {
    const content = buildCursorRule(makeFingerprint())
    const fences = [...content.matchAll(/^---$/gm)]
    expect(fences.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── Section markers ──────────────────────────────────────────────────────────

describe('buildCursorRule — always-present sections', () => {
  it('includes overview section with markers', () => {
    const content = buildCursorRule(makeFingerprint())
    expect(content).toContain('<!-- openskulls:section:overview -->')
    expect(content).toContain('<!-- /openskulls:section:overview -->')
    expect(content).toContain('## Project overview')
  })

  it('includes tech_stack section with markers', () => {
    const content = buildCursorRule(makeFingerprint())
    expect(content).toContain('<!-- openskulls:section:tech_stack -->')
    expect(content).toContain('<!-- /openskulls:section:tech_stack -->')
    expect(content).toContain('## Tech stack')
  })

  it('includes agent_guidance section with markers', () => {
    const content = buildCursorRule(makeFingerprint())
    expect(content).toContain('<!-- openskulls:section:agent_guidance -->')
    expect(content).toContain('<!-- /openskulls:section:agent_guidance -->')
    expect(content).toContain('## Agent guidance')
  })
})

// ─── Overview content ─────────────────────────────────────────────────────────

describe('buildCursorRule — overview', () => {
  it('includes architecture style label', () => {
    const fp = makeFingerprint({ architecture: { style: 'cli', entryPoints: [], moduleStructure: [] } })
    const content = buildCursorRule(fp)
    expect(content).toContain('CLI tool')
  })

  it('includes description when present', () => {
    const fp = makeFingerprint({ description: 'A tool that does things' })
    const content = buildCursorRule(fp)
    expect(content).toContain('A tool that does things')
  })

  it('includes primary language and framework', () => {
    const fp = makeFingerprint({ primaryLanguage: 'TypeScript', primaryFramework: 'Next.js' })
    const content = buildCursorRule(fp)
    expect(content).toContain('**TypeScript**')
    expect(content).toContain('**Next.js**')
  })

  it('omits unknown architecture style', () => {
    const fp = makeFingerprint({ architecture: { style: 'unknown', entryPoints: [], moduleStructure: [] } })
    const content = buildCursorRule(fp)
    expect(content).not.toContain('unknown')
  })
})

// ─── Tech stack content ───────────────────────────────────────────────────────

describe('buildCursorRule — tech stack', () => {
  it('lists languages with percentage', () => {
    const fp = makeFingerprint({
      languages: [{
        name: 'TypeScript', version: '5.3.0', confidence: 'high',
        percentage: 85, primary: true, evidence: [],
      }],
    })
    const content = buildCursorRule(fp)
    expect(content).toContain('**TypeScript**')
    expect(content).toContain('85%')
    expect(content).toContain('*(primary)*')
  })

  it('lists frameworks', () => {
    const fp = makeFingerprint({
      frameworks: [{ name: 'React', version: '18.0.0', category: 'frontend', confidence: 'high', evidence: [] }],
    })
    const content = buildCursorRule(fp)
    expect(content).toContain('**React**')
    expect(content).toContain('frontend')
  })
})

// ─── Optional sections ────────────────────────────────────────────────────────

describe('buildCursorRule — conventions section', () => {
  it('includes conventions section when conventions have values', () => {
    const fp = makeFingerprint({
      conventions: [{ name: 'indent_style', value: 'spaces', confidence: 'high', evidence: [] }],
    })
    const content = buildCursorRule(fp)
    expect(content).toContain('<!-- openskulls:section:conventions -->')
    expect(content).toContain('**Indent Style**')
    expect(content).toContain('`spaces`')
  })

  it('omits conventions section when no conventions have values', () => {
    const fp = makeFingerprint({ conventions: [] })
    const content = buildCursorRule(fp)
    expect(content).not.toContain('<!-- openskulls:section:conventions -->')
  })

  it('includes linting tools in conventions section', () => {
    const fp = makeFingerprint({ linting: { tools: ['eslint', 'prettier'] } })
    const content = buildCursorRule(fp)
    expect(content).toContain('eslint')
    expect(content).toContain('prettier')
  })
})

describe('buildCursorRule — testing section', () => {
  it('includes testing section when testing info present', () => {
    const fp = makeFingerprint({ testing: { framework: 'vitest', pattern: 'tests/**/*.test.ts', coverageTool: 'v8', confidence: 'high' } })
    const content = buildCursorRule(fp)
    expect(content).toContain('<!-- openskulls:section:testing -->')
    expect(content).toContain('**Framework**: vitest')
    expect(content).toContain('`tests/**/*.test.ts`')
    expect(content).toContain('v8')
  })

  it('omits testing section when no testing info', () => {
    const fp = makeFingerprint({ testing: undefined })
    const content = buildCursorRule(fp)
    expect(content).not.toContain('<!-- openskulls:section:testing -->')
  })
})

// ─── Workflow rules section ───────────────────────────────────────────────────

describe('buildCursorRule — workflow_rules section', () => {
  it('includes workflow_rules section when workflow config provided', () => {
    const workflow: WorkflowConfig = { autoDocs: 'always', autoCommit: 'always' }
    const content = buildCursorRule(makeFingerprint(), workflow)
    expect(content).toContain('<!-- openskulls:section:workflow_rules -->')
    expect(content).toContain('<!-- /openskulls:section:workflow_rules -->')
    expect(content).toContain('## Workflow rules')
  })

  it('omits workflow_rules section when no workflow config', () => {
    const content = buildCursorRule(makeFingerprint())
    expect(content).not.toContain('<!-- openskulls:section:workflow_rules -->')
  })

  it('omits workflow_rules section when all settings are never', () => {
    const workflow: WorkflowConfig = { autoDocs: 'never', autoCommit: 'never' }
    const content = buildCursorRule(makeFingerprint(), workflow)
    expect(content).not.toContain('<!-- openskulls:section:workflow_rules -->')
  })
})

// ─── Agent guidance content ───────────────────────────────────────────────────

describe('buildCursorRule — agent guidance', () => {
  it('includes conventional commits guidance when detected', () => {
    const fp = makeFingerprint({
      git: { commitStyle: 'conventional_commits', defaultBranch: 'main', branchingStrategy: 'none' },
    })
    const content = buildCursorRule(fp)
    expect(content).toContain('Conventional Commits')
  })

  it('always includes standard guidance lines', () => {
    const content = buildCursorRule(makeFingerprint())
    expect(content).toContain('read the relevant module')
    expect(content).toContain('Run the test suite')
    expect(content).toContain('Do not modify files outside the scope')
  })
})

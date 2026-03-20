/**
 * Tests for CopilotGenerator and buildCopilotInstructions.
 *
 * The generator is pure: same GeneratorInput → same GeneratedFile[].
 * No filesystem writes in generate(); tests need no temp dirs.
 */

import { describe, expect, it } from 'vitest'
import { CopilotGenerator, buildCopilotInstructions } from '../../src/core/generators/copilot.js'
import type { GeneratorInput } from '../../src/core/generators/base.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'
import type { AISkill } from '../../src/core/fingerprint/skills-builder.js'
import { defaultProjectConfig, defaultGlobalConfig, type WorkflowConfig } from '../../src/core/config/types.js'
import type { SkullPackage } from '../../src/core/packages/types.js'

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

function makePackage(partial: Partial<SkullPackage>): SkullPackage {
  return {
    schemaVersion: '1.0.0',
    name: '@test/pkg',
    version: '1.0.0',
    description: 'Test package',
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

function makeSkill(overrides: Partial<AISkill> = {}): AISkill {
  return {
    id: 'add-feature',
    title: 'Add a Feature',
    description: 'Use when adding a new feature to the codebase.',
    content: '# Add a Feature\n\nReference for adding new features.\n\n## Core Rules\n\n- Follow existing patterns\n- Write tests',
    category: 'workflow',
    ...overrides,
  }
}

const gen = new CopilotGenerator()

// ─── Generator metadata ───────────────────────────────────────────────────────

describe('CopilotGenerator metadata', () => {
  it('has the right toolId and toolName', () => {
    expect(gen.toolId).toBe('copilot')
    expect(gen.toolName).toBe('GitHub Copilot')
  })

  it('detects via .github/copilot-instructions.md', () => {
    const configFiles = new Map([['.github/copilot-instructions.md', '...']])
    expect(gen.isDetected(configFiles)).toBe(true)
  })

  it('is not detected when detection file is absent', () => {
    const configFiles = new Map([['CLAUDE.md', '...']])
    expect(gen.isDetected(configFiles)).toBe(false)
  })
})

// ─── Generated file shape ─────────────────────────────────────────────────────

describe('CopilotGenerator file shape', () => {
  it('always produces copilot-instructions.md', () => {
    const files = gen.generate(makeInput())
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.github/copilot-instructions.md')
  })

  it('writes to .github/copilot-instructions.md', () => {
    const files = gen.generate(makeInput())
    const instructions = files.find((f) => f.relativePath === '.github/copilot-instructions.md')!
    expect(instructions).toBeDefined()
  })

  it('uses merge_sections strategy', () => {
    const files = gen.generate(makeInput())
    const instructions = files.find((f) => f.relativePath === '.github/copilot-instructions.md')!
    expect(instructions.mergeStrategy).toBe('merge_sections')
  })

  it('has repo base, not gitignored', () => {
    const files = gen.generate(makeInput())
    const instructions = files.find((f) => f.relativePath === '.github/copilot-instructions.md')!
    expect(instructions.base).toBe('repo')
    expect(instructions.isGitignored).toBe(false)
  })
})

// ─── Section markers ──────────────────────────────────────────────────────────

describe('buildCopilotInstructions — always-present sections', () => {
  it('includes overview section with markers', () => {
    const fp = makeFingerprint({ repoName: 'my-repo' })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('<!-- openskulls:section:overview -->')
    expect(content).toContain('<!-- /openskulls:section:overview -->')
    expect(content).toContain('## Project overview')
  })

  it('includes tech_stack section with markers', () => {
    const content = buildCopilotInstructions(makeFingerprint())
    expect(content).toContain('<!-- openskulls:section:tech_stack -->')
    expect(content).toContain('<!-- /openskulls:section:tech_stack -->')
    expect(content).toContain('## Tech stack')
  })

  it('includes agent_guidance section with markers', () => {
    const content = buildCopilotInstructions(makeFingerprint())
    expect(content).toContain('<!-- openskulls:section:agent_guidance -->')
    expect(content).toContain('<!-- /openskulls:section:agent_guidance -->')
    expect(content).toContain('## Agent guidance')
  })
})

// ─── Overview content ─────────────────────────────────────────────────────────

describe('buildCopilotInstructions — overview', () => {
  it('includes architecture style label', () => {
    const fp = makeFingerprint({ architecture: { style: 'cli', entryPoints: [], moduleStructure: [] } })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('CLI tool')
  })

  it('includes description when present', () => {
    const fp = makeFingerprint({ description: 'A tool that does things' })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('A tool that does things')
  })

  it('includes primary language and framework', () => {
    const fp = makeFingerprint({ primaryLanguage: 'TypeScript', primaryFramework: 'Next.js' })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('**TypeScript**')
    expect(content).toContain('**Next.js**')
  })

  it('omits unknown architecture style', () => {
    const fp = makeFingerprint({ architecture: { style: 'unknown', entryPoints: [], moduleStructure: [] } })
    const content = buildCopilotInstructions(fp)
    // 'unknown' should not appear in the output
    expect(content).not.toContain('unknown')
  })
})

// ─── Tech stack content ───────────────────────────────────────────────────────

describe('buildCopilotInstructions — tech stack', () => {
  it('lists languages with percentage', () => {
    const fp = makeFingerprint({
      languages: [{
        name: 'TypeScript', version: '5.3.0', confidence: 'high',
        percentage: 85, primary: true, evidence: [],
      }],
    })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('**TypeScript**')
    expect(content).toContain('85%')
    expect(content).toContain('*(primary)*')
  })

  it('lists frameworks', () => {
    const fp = makeFingerprint({
      frameworks: [{ name: 'React', version: '18.0.0', category: 'frontend', confidence: 'high', evidence: [] }],
    })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('**React**')
    expect(content).toContain('frontend')
  })
})

// ─── Optional sections ────────────────────────────────────────────────────────

describe('buildCopilotInstructions — conventions section', () => {
  it('includes conventions section when conventions have values', () => {
    const fp = makeFingerprint({
      conventions: [{ name: 'indent_style', value: 'spaces', confidence: 'high', evidence: [] }],
    })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('<!-- openskulls:section:conventions -->')
    expect(content).toContain('**Indent Style**')
    expect(content).toContain('`spaces`')
  })

  it('omits conventions section when no conventions have values', () => {
    const fp = makeFingerprint({ conventions: [] })
    const content = buildCopilotInstructions(fp)
    expect(content).not.toContain('<!-- openskulls:section:conventions -->')
  })

  it('includes linting tools in conventions section', () => {
    const fp = makeFingerprint({ linting: { tools: ['eslint', 'prettier'] } })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('<!-- openskulls:section:conventions -->')
    expect(content).toContain('eslint')
    expect(content).toContain('prettier')
  })
})

describe('buildCopilotInstructions — testing section', () => {
  it('includes testing section when testing info present', () => {
    const fp = makeFingerprint({ testing: { framework: 'vitest', pattern: 'tests/**/*.test.ts', coverageTool: 'v8', confidence: 'high' } })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('<!-- openskulls:section:testing -->')
    expect(content).toContain('**Framework**: vitest')
    expect(content).toContain('`tests/**/*.test.ts`')
    expect(content).toContain('v8')
  })

  it('omits testing section when no testing info', () => {
    const fp = makeFingerprint({ testing: undefined })
    const content = buildCopilotInstructions(fp)
    expect(content).not.toContain('<!-- openskulls:section:testing -->')
  })
})

// ─── Workflow rules section ───────────────────────────────────────────────────

describe('buildCopilotInstructions — workflow_rules section', () => {
  it('includes workflow_rules section when workflow config provided', () => {
    const fp = makeFingerprint()
    const workflow: WorkflowConfig = { autoDocs: 'always', autoCommit: 'always' }
    const content = buildCopilotInstructions(fp, workflow)
    expect(content).toContain('<!-- openskulls:section:workflow_rules -->')
    expect(content).toContain('<!-- /openskulls:section:workflow_rules -->')
    expect(content).toContain('## Workflow rules')
  })

  it('omits workflow_rules section when no workflow config', () => {
    const content = buildCopilotInstructions(makeFingerprint())
    expect(content).not.toContain('<!-- openskulls:section:workflow_rules -->')
  })

  it('includes auto-docs always rule', () => {
    const workflow: WorkflowConfig = { autoDocs: 'always', autoCommit: 'never' }
    const content = buildCopilotInstructions(makeFingerprint(), workflow)
    expect(content).toContain('always update README.md')
  })

  it('includes auto-docs ask rule', () => {
    const workflow: WorkflowConfig = { autoDocs: 'ask', autoCommit: 'never' }
    const content = buildCopilotInstructions(makeFingerprint(), workflow)
    expect(content).toContain('ask the user whether')
  })

  it('omits docs rule when autoDocs is never', () => {
    const workflow: WorkflowConfig = { autoDocs: 'never', autoCommit: 'ask' }
    const content = buildCopilotInstructions(makeFingerprint(), workflow)
    expect(content).not.toContain('Documentation')
  })

  it('includes auto-commit always rule', () => {
    const workflow: WorkflowConfig = { autoDocs: 'never', autoCommit: 'always' }
    const content = buildCopilotInstructions(makeFingerprint(), workflow)
    expect(content).toContain('stage the relevant changed files')
  })

  it('omits workflow_rules section when all settings are never', () => {
    const workflow: WorkflowConfig = { autoDocs: 'never', autoCommit: 'never' }
    const content = buildCopilotInstructions(makeFingerprint(), workflow)
    expect(content).not.toContain('<!-- openskulls:section:workflow_rules -->')
  })
})

// ─── Agent guidance content ───────────────────────────────────────────────────

describe('buildCopilotInstructions — agent guidance', () => {
  it('includes conventional commits guidance when detected', () => {
    const fp = makeFingerprint({
      git: { commitStyle: 'conventional_commits', defaultBranch: 'main', branchingStrategy: 'none' },
    })
    const content = buildCopilotInstructions(fp)
    expect(content).toContain('Conventional Commits')
  })

  it('always includes standard guidance lines', () => {
    const content = buildCopilotInstructions(makeFingerprint())
    expect(content).toContain('read the relevant module')
    expect(content).toContain('Run the test suite')
    expect(content).toContain('Do not modify files outside the scope')
  })
})

// ─── Section ordering ─────────────────────────────────────────────────────────

describe('buildCopilotInstructions — section ordering', () => {
  it('agent_guidance appears after workflow_rules', () => {
    const workflow: WorkflowConfig = { autoDocs: 'always', autoCommit: 'always' }
    const content = buildCopilotInstructions(makeFingerprint(), workflow)
    const workflowPos = content.indexOf('<!-- openskulls:section:workflow_rules -->')
    const agentPos    = content.indexOf('<!-- openskulls:section:agent_guidance -->')
    expect(workflowPos).toBeGreaterThan(-1)
    expect(agentPos).toBeGreaterThan(workflowPos)
  })

  it('tech_stack appears before conventions', () => {
    const fp = makeFingerprint({
      conventions: [{ name: 'indent_style', value: 'spaces', confidence: 'high', evidence: [] }],
    })
    const content = buildCopilotInstructions(fp)
    const techPos   = content.indexOf('<!-- openskulls:section:tech_stack -->')
    const convPos   = content.indexOf('<!-- openskulls:section:conventions -->')
    expect(techPos).toBeGreaterThan(-1)
    expect(convPos).toBeGreaterThan(techPos)
  })
})

// ─── Built-in skill files ───────────────────────────────────────────────────

describe('built-in skill files', () => {
  it('generates run-tests.md when testing is detected', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/commands/run-tests.md')
  })

  it('run-tests.md uses correct command for npm (default)', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const runTests = files.find((f) => f.relativePath === '.claude/commands/run-tests.md')!
    expect(runTests.content).toContain('npm test')
  })

  it('run-tests.md uses bun test when bun is the package manager', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
      conventions: [{ name: 'package_manager', value: 'bun', confidence: 'high', evidence: [] }],
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const runTests = files.find((f) => f.relativePath === '.claude/commands/run-tests.md')!
    expect(runTests.content).toContain('bun test')
  })

  it('does not generate run-tests.md when testing is absent', () => {
    const fp = makeFingerprint({ testing: undefined })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).not.toContain('.claude/commands/run-tests.md')
  })

  it('generates commit.md when conventional commits is detected', () => {
    const fp = makeFingerprint({
      git: { primaryBranch: 'main', contributorsCount: 1, commitStyle: 'conventional_commits' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/commands/commit.md')
  })

  it('does not generate commit.md when conventional commits is absent', () => {
    const fp = makeFingerprint({ conventions: [], git: undefined })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).not.toContain('.claude/commands/commit.md')
  })

  it('skill files have YAML frontmatter with description', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const runTests = files.find((f) => f.relativePath === '.claude/commands/run-tests.md')!
    expect(runTests.content).toMatch(/^---\n/)
    expect(runTests.content).toContain('description:')
  })
})

// ─── AI-generated skill files ───────────────────────────────────────────────

describe('AI-generated skill files', () => {
  it('emits a SKILL.md per AI skill under .claude/skills/', () => {
    const skills: AISkill[] = [
      makeSkill({ id: 'add-api-endpoint', title: 'Add API Endpoint', category: 'workflow' }),
      makeSkill({ id: 'write-unit-test', title: 'Write Unit Test', category: 'testing' }),
    ]
    const files = gen.generate(makeInput({ aiSkills: skills }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/skills/add-api-endpoint/SKILL.md')
    expect(paths).toContain('.claude/skills/write-unit-test/SKILL.md')
  })

  it('emits .claude/skills.md overview when skills are present', () => {
    const files = gen.generate(makeInput({ aiSkills: [makeSkill()] }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/skills.md')
  })

  it('skill files use replace strategy', () => {
    const files = gen.generate(makeInput({ aiSkills: [makeSkill({ id: 'my-skill' })] }))
    const skillFile = files.find((f) => f.relativePath === '.claude/skills/my-skill/SKILL.md')!
    expect(skillFile.mergeStrategy).toBe('replace')
  })

  it('skill files have YAML frontmatter with name and description', () => {
    const skill = makeSkill({
      id: 'add-route',
      description: 'Use when adding routes.',
    })
    const files = gen.generate(makeInput({ aiSkills: [skill] }))
    const content = files.find((f) => f.relativePath === '.claude/skills/add-route/SKILL.md')!.content
    expect(content).toMatch(/^---\n/)
    expect(content).toContain('name: add-route')
    expect(content).toContain('description: >')
  })

  it('skill file body contains the generated content', () => {
    const skill = makeSkill({
      id: 'refactor-module',
      content: '# Refactor a Module\n\n## Core Rules\n\n- Read before editing',
    })
    const files = gen.generate(makeInput({ aiSkills: [skill] }))
    const content = files.find((f) => f.relativePath === '.claude/skills/refactor-module/SKILL.md')!.content
    expect(content).toContain('# Refactor a Module')
    expect(content).toContain('Read before editing')
  })

  it('does not emit skill files when aiSkills is empty', () => {
    const files = gen.generate(makeInput({ aiSkills: [] }))
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/'))
    expect(skillFiles).toHaveLength(0)
  })

  it('does not emit skill files when aiSkills is absent', () => {
    const files = gen.generate(makeInput())
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/'))
    expect(skillFiles).toHaveLength(0)
  })
})

// ─── Package skill files ─────────────────────────────────────────────────────

describe('package skill files', () => {
  it('generates a SKILL.md for each skill in installed packages', () => {
    const pkg = makePackage({
      skills: [
        {
          id: 'review-pr',
          name: 'Review PR',
          description: 'Review a pull request',
          content: '# Review PR\n\nReview code changes.',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        },
      ],
    })
    const files = gen.generate(makeInput({ installedPackages: [pkg] }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/skills/@test/pkg-review-pr/SKILL.md')
  })

  it('excludes skills not compatible with copilot', () => {
    const pkg = makePackage({
      skills: [
        {
          id: 'claude-only',
          name: 'Claude Only',
          description: 'Only for Claude',
          content: 'Claude stuff',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: ['claude_code'],
        },
        {
          id: 'all-tools',
          name: 'All Tools',
          description: 'Works everywhere',
          content: 'Universal skill',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        },
      ],
    })
    const files = gen.generate(makeInput({ installedPackages: [pkg] }))
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/@test/pkg'))
    expect(skillFiles).toHaveLength(1)
    expect(skillFiles[0].relativePath).toBe('.claude/skills/@test/pkg-all-tools/SKILL.md')
  })
})

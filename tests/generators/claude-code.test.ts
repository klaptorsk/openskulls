/**
 * Tests for ClaudeCodeGenerator.
 *
 * The generator is pure: same GeneratorInput → same GeneratedFile[].
 * No filesystem writes in generate(); tests need no temp dirs.
 */

import { describe, expect, it } from 'vitest'
import { ClaudeCodeGenerator } from '../../src/core/generators/claude-code.js'
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

const gen = new ClaudeCodeGenerator()

// ─── Generator metadata ───────────────────────────────────────────────────────

describe('ClaudeCodeGenerator metadata', () => {
  it('has the right toolId and toolName', () => {
    expect(gen.toolId).toBe('claude_code')
    expect(gen.toolName).toBe('Claude Code')
  })

  it('detects via CLAUDE.md or .claude/settings.json', () => {
    const configFiles = new Map([['CLAUDE.md', '/repo/CLAUDE.md']])
    expect(gen.isDetected(configFiles)).toBe(true)
  })

  it('is not detected when neither detection file is present', () => {
    const configFiles = new Map([['package.json', '/repo/package.json']])
    expect(gen.isDetected(configFiles)).toBe(false)
  })
})

// ─── File list shape ──────────────────────────────────────────────────────────

describe('generated file list', () => {
  it('always produces CLAUDE.md and .claude/settings.json', () => {
    const files = gen.generate(makeInput())
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('CLAUDE.md')
    expect(paths).toContain('.claude/settings.json')
  })

  it('CLAUDE.md has merge_sections strategy', () => {
    const files = gen.generate(makeInput())
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md')!
    expect(claudeMd.mergeStrategy).toBe('merge_sections')
    expect(claudeMd.base).toBe('repo')
    expect(claudeMd.isGitignored).toBe(false)
  })

  it('settings.json has replace strategy', () => {
    const files = gen.generate(makeInput())
    const settings = files.find((f) => f.relativePath === '.claude/settings.json')!
    expect(settings.mergeStrategy).toBe('replace')
  })

  it('produces no command files when there are no packages', () => {
    const files = gen.generate(makeInput())
    const commands = files.filter((f) => f.relativePath.startsWith('.claude/commands/'))
    expect(commands).toHaveLength(0)
  })
})

// ─── CLAUDE.md content ────────────────────────────────────────────────────────

describe('CLAUDE.md content', () => {
  it('includes the repo name as the h1 heading', () => {
    const fp = makeFingerprint({ repoName: 'my-awesome-repo' })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md')!
    expect(claudeMd.content).toContain('# my-awesome-repo')
  })

  it('renders primary language and framework in overview', () => {
    const fp = makeFingerprint({
      primaryLanguage: 'TypeScript',
      primaryFramework: 'Next.js',
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const content = files.find((f) => f.relativePath === 'CLAUDE.md')!.content
    expect(content).toContain('TypeScript')
    expect(content).toContain('Next.js')
  })

  it('renders language list in tech stack section', () => {
    const fp = makeFingerprint({
      languages: [
        {
          name: 'TypeScript',
          version: '5.3.0',
          confidence: 'high',
          percentage: 90,
          primary: true,
          evidence: [],
        },
        {
          name: 'JavaScript',
          confidence: 'medium',
          percentage: 10,
          primary: false,
          evidence: [],
        },
      ],
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('TypeScript')
    expect(content).toContain('5.3.0')
    expect(content).toContain('JavaScript')
  })

  it('renders framework list when frameworks are present', () => {
    const fp = makeFingerprint({
      frameworks: [
        { name: 'React', version: '18.2.0', confidence: 'high', category: 'frontend', evidence: [] },
      ],
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('React')
    expect(content).toContain('18.2.0')
    expect(content).toContain('frontend')
  })

  it('does not show Frameworks section when no frameworks detected', () => {
    const fp = makeFingerprint({ frameworks: [] })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).not.toContain('Frameworks & Libraries')
  })

  it('renders architecture style', () => {
    const fp = makeFingerprint({
      architecture: {
        style: 'monorepo',
        entryPoints: [],
        moduleStructure: [],
        hasMigrations: false,
      },
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('Monorepo')
  })

  it('renders entry points and module structure', () => {
    const fp = makeFingerprint({
      architecture: {
        style: 'monolith',
        entryPoints: ['src/index.ts', 'main.py'],
        moduleStructure: ['src', 'tests'],
        hasMigrations: false,
      },
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('src/index.ts')
    expect(content).toContain('main.py')
    expect(content).toContain('src/')
    expect(content).toContain('tests/')
  })

  it('renders detected conventions that have a value', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'conventional_commits', value: 'conventional', confidence: 'high', evidence: [] },
        { name: 'no_value_signal', confidence: 'low', evidence: [] },
      ],
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('Conventional Commits')
    // The no-value convention should not be rendered
    expect(content).not.toContain('No Value Signal')
  })

  it('renders low-confidence conventions with an inferred caveat', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'commit_style', value: 'jira_prefixed', confidence: 'low', evidence: [] },
      ],
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('inferred')
  })

  it('renders linting tools', () => {
    const fp = makeFingerprint({
      linting: { tools: ['eslint', 'prettier'], configFiles: [], styleRules: {} },
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('eslint')
    expect(content).toContain('prettier')
  })

  it('renders testing section when testing is present', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('vitest')
    expect(content).toContain('**/*.test.ts')
  })

  it('omits testing section when not detected', () => {
    const fp = makeFingerprint({ testing: undefined })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).not.toContain('## Testing')
  })

  it('renders CI/CD section when present', () => {
    const fp = makeFingerprint({
      cicd: {
        platform: 'github_actions',
        workflows: ['ci.yml'],
        hasDeploy: true,
        deployTargets: ['vercel'],
        confidence: 'high',
      },
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    // titlecase helper transforms 'github_actions' → 'Github Actions'
    expect(content).toContain('Github Actions')
    expect(content).toContain('vercel')
  })

  it('includes conventional commits guidance when detected via git signal', () => {
    const fp = makeFingerprint({
      git: { primaryBranch: 'main', contributorsCount: 2, commitStyle: 'conventional_commits' },
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    expect(content).toContain('Conventional Commits')
  })

  it('includes conventional commits guidance when detected via conventions array', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'conventional_commits', value: 'conventional', confidence: 'high', evidence: [] },
      ],
    })
    const content = gen.generate(makeInput({ fingerprint: fp }))[0].content
    // Should appear in Agent Guidance section
    expect(content).toContain('Conventional Commits')
  })

  it('contains openskulls section markers for merge strategy', () => {
    const content = gen.generate(makeInput())[0].content
    expect(content).toContain('<!-- openskulls:section:overview -->')
    expect(content).toContain('<!-- /openskulls:section:overview -->')
    expect(content).toContain('<!-- openskulls:section:tech_stack -->')
    expect(content).toContain('<!-- openskulls:section:agent_guidance -->')
  })

  it('is deterministic — same input produces same output', () => {
    const input = makeInput({
      fingerprint: makeFingerprint({ repoName: 'deterministic-test' }),
    })
    const a = gen.generate(input)
    const b = gen.generate(input)
    expect(a[0].content).toBe(b[0].content)
  })
})

// ─── Package skill files ──────────────────────────────────────────────────────

describe('skill command files', () => {
  it('generates a skill file for each skill in installed packages', () => {
    const pkg = makePackage({
      skills: [
        {
          id: 'commit',
          name: 'Commit',
          description: 'Create a conventional commit',
          content: '# Commit\n\nRun git commit with conventional format.',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        },
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
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/') && f.relativePath.includes('@test/pkg'))
    expect(skillFiles).toHaveLength(2)
    expect(skillFiles.map((f) => f.relativePath)).toContain('.claude/skills/@test/pkg-commit/SKILL.md')
    expect(skillFiles.map((f) => f.relativePath)).toContain('.claude/skills/@test/pkg-review-pr/SKILL.md')
  })

  it('preserves skill content in SKILL.md wrapper', () => {
    const skillContent = '# My Skill\n\nDo something specific.\n\n- Step 1\n- Step 2\n'
    const pkg = makePackage({
      skills: [
        {
          id: 'my-skill',
          name: 'My Skill',
          description: 'Does something',
          content: skillContent,
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        },
      ],
    })
    const files = gen.generate(makeInput({ installedPackages: [pkg] }))
    const skillFile = files.find((f) => f.relativePath === '.claude/skills/@test/pkg-my-skill/SKILL.md')!
    expect(skillFile).toBeDefined()
    expect(skillFile.content).toContain(skillContent)
  })

  it('excludes skills not compatible with claude_code', () => {
    const pkg = makePackage({
      skills: [
        {
          id: 'cursor-only',
          name: 'Cursor Only',
          description: 'Only for Cursor',
          content: 'Cursor stuff',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: ['cursor'],  // Not claude_code
        },
        {
          id: 'all-tools',
          name: 'All Tools',
          description: 'Works everywhere',
          content: 'Universal skill',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],  // Empty = all tools
        },
      ],
    })
    const files = gen.generate(makeInput({ installedPackages: [pkg] }))
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/@test/pkg'))
    expect(skillFiles).toHaveLength(1)
    expect(skillFiles[0].relativePath).toBe('.claude/skills/@test/pkg-all-tools/SKILL.md')
  })

  it('handles multiple packages, deduplication left to caller', () => {
    const pkg1 = makePackage({
      name: '@test/pkg1',
      skills: [
        {
          id: 'skill-a',
          name: 'Skill A',
          description: '',
          content: 'Content A',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        },
      ],
    })
    const pkg2 = makePackage({
      name: '@test/pkg2',
      skills: [
        {
          id: 'skill-b',
          name: 'Skill B',
          description: '',
          content: 'Content B',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        },
      ],
    })
    const files = gen.generate(makeInput({ installedPackages: [pkg1, pkg2] }))
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/') && f.relativePath.endsWith('/SKILL.md') && f.relativePath.includes('@test/pkg'))
    expect(skillFiles).toHaveLength(2)
  })
})

// ─── Package context sections ─────────────────────────────────────────────────

describe('package context sections in CLAUDE.md', () => {
  it('injects package context sections into the generated CLAUDE.md', () => {
    const pkg = makePackage({
      contextSections: {
        'react-patterns': '## React Patterns\n\nUse functional components.',
        'test-conventions': '## Testing Conventions\n\nWrite RTL tests.',
      },
    })
    const content = gen.generate(makeInput({ installedPackages: [pkg] }))[0].content
    expect(content).toContain('react-patterns')
    expect(content).toContain('Use functional components.')
    expect(content).toContain('test-conventions')
    expect(content).toContain('Write RTL tests.')
  })

  it('wraps package sections with openskulls section markers', () => {
    const pkg = makePackage({
      contextSections: { 'my-section': 'My content here.' },
    })
    const content = gen.generate(makeInput({ installedPackages: [pkg] }))[0].content
    expect(content).toContain('<!-- openskulls:section:pkg_my-section -->')
    expect(content).toContain('<!-- /openskulls:section:pkg_my-section -->')
  })
})

// ─── Built-in skill files ─────────────────────────────────────────────────────

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

  it('generates commit.md when conventional commits is detected via git signal', () => {
    const fp = makeFingerprint({
      git: { primaryBranch: 'main', contributorsCount: 1, commitStyle: 'conventional_commits' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/commands/commit.md')
  })

  it('generates commit.md when conventional commits is detected via conventions array', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'conventional_commits', value: 'conventional', confidence: 'high', evidence: [] },
      ],
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

  it('run-tests.md uses frontmatter format with description', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const runTests = files.find((f) => f.relativePath === '.claude/commands/run-tests.md')!
    expect(runTests.content).toMatch(/^---\n/)
    expect(runTests.content).toContain('description:')
  })

  it('commit.md uses frontmatter format and contains Conventional Commits guidance', () => {
    const fp = makeFingerprint({
      git: { primaryBranch: 'main', contributorsCount: 1, commitStyle: 'conventional_commits' },
    })
    const files = gen.generate(makeInput({ fingerprint: fp }))
    const commitFile = files.find((f) => f.relativePath === '.claude/commands/commit.md')!
    expect(commitFile.content).toMatch(/^---\n/)
    expect(commitFile.content).toContain('description:')
    expect(commitFile.content).toContain('Conventional Commits')
    expect(commitFile.content).toContain('<type>(<scope>): <description>')
  })
})

// ─── AI-generated skills ──────────────────────────────────────────────────────

function makeSkill(overrides: Partial<AISkill> = {}): AISkill {
  return {
    id: 'add-feature',
    title: 'Add a Feature',
    description: 'Use when adding a new feature to the codebase. Triggers: new feature, implementation, add functionality.',
    content: '# Add a Feature\n\nReference for adding new features.\n\n## Core Rules\n\n- Follow existing patterns\n- Write tests\n\n## Anti-Patterns\n\n- Do not skip tests\n\n## Checklist\n\n- [ ] Tests written\n- [ ] `npm test` passes',
    category: 'workflow',
    ...overrides,
  }
}

describe('AI-generated skills', () => {
  it('emits .claude/skills.md when aiSkills are provided', () => {
    const files = gen.generate(makeInput({ aiSkills: [makeSkill()] }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/skills.md')
  })

  it('.claude/skills.md uses merge_sections strategy', () => {
    const files = gen.generate(makeInput({ aiSkills: [makeSkill()] }))
    const skillsMd = files.find((f) => f.relativePath === '.claude/skills.md')!
    expect(skillsMd.mergeStrategy).toBe('merge_sections')
  })

  it('.claude/skills.md has openskulls section markers', () => {
    const files = gen.generate(makeInput({ aiSkills: [makeSkill()] }))
    const content = files.find((f) => f.relativePath === '.claude/skills.md')!.content
    expect(content).toContain('<!-- openskulls:section:skills -->')
    expect(content).toContain('<!-- /openskulls:section:skills -->')
  })

  it('emits a SKILL.md per AI skill at .claude/skills/<id>/SKILL.md', () => {
    const skills: AISkill[] = [
      makeSkill({ id: 'add-api-endpoint', title: 'Add API Endpoint', category: 'workflow' }),
      makeSkill({ id: 'write-unit-test', title: 'Write Unit Test', category: 'testing' }),
    ]
    const files = gen.generate(makeInput({ aiSkills: skills }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.claude/skills/add-api-endpoint/SKILL.md')
    expect(paths).toContain('.claude/skills/write-unit-test/SKILL.md')
  })

  it('SKILL.md files use replace strategy', () => {
    const files = gen.generate(makeInput({ aiSkills: [makeSkill({ id: 'my-skill' })] }))
    const skillFile = files.find((f) => f.relativePath === '.claude/skills/my-skill/SKILL.md')!
    expect(skillFile.mergeStrategy).toBe('replace')
  })

  it('SKILL.md has YAML frontmatter with name and description', () => {
    const skill = makeSkill({
      id: 'add-route',
      description: 'Use when adding routes. Triggers: new route, handler.',
    })
    const files = gen.generate(makeInput({ aiSkills: [skill] }))
    const content = files.find((f) => f.relativePath === '.claude/skills/add-route/SKILL.md')!.content
    expect(content).toMatch(/^---\n/)
    expect(content).toContain('name: add-route')
    expect(content).toContain('description:')
  })

  it('SKILL.md body contains the generated content', () => {
    const skill = makeSkill({
      id: 'refactor-module',
      title: 'Refactor a Module',
      content: '# Refactor a Module\n\n## Core Rules\n\n- Read before editing',
    })
    const files = gen.generate(makeInput({ aiSkills: [skill] }))
    const content = files.find((f) => f.relativePath === '.claude/skills/refactor-module/SKILL.md')!.content
    expect(content).toContain('# Refactor a Module')
    expect(content).toContain('## Core Rules')
    expect(content).toContain('Read before editing')
  })

  it('skills.md includes skill title, invocation, and description', () => {
    const skill = makeSkill({ id: 'add-route', title: 'Add a Route', description: 'Use when adding routes. Triggers: route.' })
    const files = gen.generate(makeInput({ aiSkills: [skill] }))
    const content = files.find((f) => f.relativePath === '.claude/skills.md')!.content
    expect(content).toContain('Add a Route')
    expect(content).toContain('/add-route')
    expect(content).toContain('Use when adding routes.')
  })

  it('skills.md groups by category alphabetically', () => {
    const skills: AISkill[] = [
      makeSkill({ id: 'fix-bug', title: 'Fix a Bug', category: 'debugging' }),
      makeSkill({ id: 'add-feature', title: 'Add a Feature', category: 'workflow' }),
      makeSkill({ id: 'write-test', title: 'Write a Test', category: 'testing' }),
    ]
    const files = gen.generate(makeInput({ aiSkills: skills }))
    const content = files.find((f) => f.relativePath === '.claude/skills.md')!.content
    const debuggingPos = content.indexOf('## Debugging')
    const testingPos = content.indexOf('## Testing')
    const workflowPos = content.indexOf('## Workflow')
    expect(debuggingPos).toBeLessThan(testingPos)
    expect(testingPos).toBeLessThan(workflowPos)
  })

  it('does not emit .claude/skills.md when aiSkills is empty', () => {
    const files = gen.generate(makeInput({ aiSkills: [] }))
    const paths = files.map((f) => f.relativePath)
    expect(paths).not.toContain('.claude/skills.md')
  })

  it('does not emit .claude/skills.md when aiSkills is absent', () => {
    const files = gen.generate(makeInput())
    const paths = files.map((f) => f.relativePath)
    expect(paths).not.toContain('.claude/skills.md')
  })

  it('does not emit SKILL.md files when aiSkills is absent', () => {
    const files = gen.generate(makeInput())
    const skillFiles = files.filter((f) => f.relativePath.includes('/SKILL.md'))
    expect(skillFiles).toHaveLength(0)
  })
})

// ─── settings.json ────────────────────────────────────────────────────────────

describe('.claude/settings.json', () => {
  it('is valid JSON', () => {
    const files = gen.generate(makeInput())
    const settings = files.find((f) => f.relativePath === '.claude/settings.json')!
    expect(() => JSON.parse(settings.content)).not.toThrow()
  })

  it('contains a version field', () => {
    const files = gen.generate(makeInput())
    const settings = files.find((f) => f.relativePath === '.claude/settings.json')!
    const parsed = JSON.parse(settings.content)
    expect(parsed).toHaveProperty('version')
  })
})

// ─── Workflow rules ───────────────────────────────────────────────────────────

describe('workflow_rules section', () => {
  it('includes workflow_rules section when workflowConfig is provided', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'always', autoCommit: 'always' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).toContain('<!-- openskulls:section:workflow_rules -->')
    expect(content).toContain('<!-- /openskulls:section:workflow_rules -->')
    expect(content).toContain('## Workflow Rules')
  })

  it('omits workflow_rules section when workflowConfig is absent', () => {
    const content = gen.generate(makeInput())[0].content
    expect(content).not.toContain('workflow_rules')
    expect(content).not.toContain('## Workflow Rules')
  })

  it('renders auto-docs "always" rule', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'always', autoCommit: 'never' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).toContain('always update README.md')
  })

  it('renders auto-docs "ask" rule', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'ask', autoCommit: 'never' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).toContain('ask the user whether documentation')
  })

  it('omits docs rule when autoDocs is "never"', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'never', autoCommit: 'ask' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).not.toContain('Documentation')
  })

  it('renders auto-commit "always" rule', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'never', autoCommit: 'always' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).toContain('create a git commit')
  })

  it('renders auto-commit "ask" rule', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'never', autoCommit: 'ask' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).toContain('ask the user if they want to commit')
  })

  it('omits commit rule when autoCommit is "never"', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'ask', autoCommit: 'never' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).not.toContain('Commits')
  })

  it('omits workflow_rules section when both are "never"', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'never', autoCommit: 'never' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    expect(content).not.toContain('## Workflow Rules')
  })

  it('section appears before agent_guidance', () => {
    const workflowConfig: WorkflowConfig = { autoDocs: 'always', autoCommit: 'always' }
    const content = gen.generate(makeInput({ workflowConfig }))[0].content
    const workflowPos = content.indexOf('<!-- openskulls:section:workflow_rules -->')
    const agentPos = content.indexOf('<!-- openskulls:section:agent_guidance -->')
    expect(workflowPos).toBeGreaterThan(-1)
    expect(workflowPos).toBeLessThan(agentPos)
  })
})

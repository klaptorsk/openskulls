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
import { defaultProjectConfig, defaultGlobalConfig } from '../../src/core/config/types.js'
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
  it('generates a command file for each skill in installed packages', () => {
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
    const commands = files.filter((f) => f.relativePath.startsWith('.claude/commands/'))
    expect(commands).toHaveLength(2)
    expect(commands.map((f) => f.relativePath)).toContain('.claude/commands/commit.md')
    expect(commands.map((f) => f.relativePath)).toContain('.claude/commands/review-pr.md')
  })

  it('preserves skill content exactly', () => {
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
    const skillFile = files.find((f) => f.relativePath === '.claude/commands/my-skill.md')!
    expect(skillFile.content).toBe(skillContent)
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
    const commands = files.filter((f) => f.relativePath.startsWith('.claude/commands/'))
    expect(commands).toHaveLength(1)
    expect(commands[0].relativePath).toBe('.claude/commands/all-tools.md')
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
    const commands = files.filter((f) => f.relativePath.startsWith('.claude/commands/'))
    expect(commands).toHaveLength(2)
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

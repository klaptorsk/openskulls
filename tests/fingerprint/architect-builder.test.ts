/**
 * Tests for architect-builder.ts
 *
 * Pure function tests only — no subprocess mocking needed.
 */

import { describe, expect, it } from 'vitest'
import { buildArchitectPrompt } from '../../src/core/fingerprint/architect-builder.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'
import type { WorkflowConfig } from '../../src/core/config/types.js'

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

function makeWorkflowConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    autoDocs:         'ask',
    autoCommit:       'ask',
    architectEnabled: true,
    architectDomain:  '',
    architectReview:  'ask',
    useSubagents:     false,
    ...overrides,
  }
}

// ─── buildArchitectPrompt ─────────────────────────────────────────────────────

describe('buildArchitectPrompt', () => {
  it('includes the project name', () => {
    const fp = makeFingerprint({ repoName: 'my-cool-app' })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('my-cool-app')
  })

  it('includes primary language when present', () => {
    const fp = makeFingerprint({ primaryLanguage: 'TypeScript' })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('TypeScript')
  })

  it('includes primary framework when present', () => {
    const fp = makeFingerprint({ primaryFramework: 'Express' })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('Express')
  })

  it('includes description when present', () => {
    const fp = makeFingerprint({ description: 'A CLI tool for developers' })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('A CLI tool for developers')
  })

  it('includes architecture style when not unknown', () => {
    const fp = makeFingerprint({
      architecture: { style: 'cli', entryPoints: ['src/index.ts'], moduleStructure: ['src'], hasMigrations: false },
    })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('cli')
  })

  it('includes entry points', () => {
    const fp = makeFingerprint({
      architecture: { style: 'cli', entryPoints: ['src/index.ts'], moduleStructure: [], hasMigrations: false },
    })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('src/index.ts')
  })

  it('includes module structure', () => {
    const fp = makeFingerprint({
      architecture: { style: 'cli', entryPoints: [], moduleStructure: ['src/core', 'src/cli'], hasMigrations: false },
    })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('src/core')
    expect(prompt).toContain('src/cli')
  })

  it('includes detected frameworks', () => {
    const fp = makeFingerprint({
      frameworks: [
        { name: 'React', version: '18.0.0', confidence: 'high', category: 'frontend', evidence: [] },
        { name: 'Express', confidence: 'medium', category: 'backend', evidence: [] },
      ],
    })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('React')
    expect(prompt).toContain('Express')
  })

  it('includes testing framework', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('vitest')
  })

  it('includes linting tools', () => {
    const fp = makeFingerprint({
      linting: { tools: ['eslint', 'prettier'], configFiles: [], styleRules: {} },
    })
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('eslint')
    expect(prompt).toContain('prettier')
  })

  it('includes workflow summary', () => {
    const fp = makeFingerprint()
    const config = makeWorkflowConfig({ autoDocs: 'always', autoCommit: 'never', architectReview: 'ask' })
    const prompt = buildArchitectPrompt(fp, config)
    expect(prompt).toContain('autoDocs: always')
    expect(prompt).toContain('autoCommit: never')
    expect(prompt).toContain('architectReview: ask')
  })

  it('includes architectDomain when provided', () => {
    const fp = makeFingerprint()
    const config = makeWorkflowConfig({ architectDomain: 'distributed systems' })
    const prompt = buildArchitectPrompt(fp, config)
    expect(prompt).toContain('distributed systems')
  })

  it('omits architect domain section when domain is empty', () => {
    const fp = makeFingerprint()
    const config = makeWorkflowConfig({ architectDomain: '' })
    const prompt = buildArchitectPrompt(fp, config)
    // The template should not include the "Primary domain focus:" line
    expect(prompt).not.toContain('Primary domain focus:')
  })

  it('includes workflow section for always-review mode', () => {
    const fp = makeFingerprint()
    const config = makeWorkflowConfig({ architectReview: 'always' })
    const prompt = buildArchitectPrompt(fp, config)
    expect(prompt).toContain('required step')
  })

  it('does not include workflow required step for ask mode', () => {
    const fp = makeFingerprint()
    const config = makeWorkflowConfig({ architectReview: 'ask' })
    const prompt = buildArchitectPrompt(fp, config)
    expect(prompt).not.toContain('required step')
  })

  it('instructs AI to return only JSON', () => {
    const fp = makeFingerprint()
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('Return only the JSON object')
  })

  it('requires id to be exactly architect-review', () => {
    const fp = makeFingerprint()
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('architect-review')
  })

  it('instructs AI to include Architectural Principles section', () => {
    const fp = makeFingerprint()
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('Architectural Principles')
  })

  it('instructs AI to include Review Checklist section', () => {
    const fp = makeFingerprint()
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('Review Checklist')
  })

  it('instructs AI to include Anti-Patterns section', () => {
    const fp = makeFingerprint()
    const prompt = buildArchitectPrompt(fp, makeWorkflowConfig())
    expect(prompt).toContain('Anti-Patterns')
  })

  it('is deterministic — same input produces same output', () => {
    const fp = makeFingerprint({ repoName: 'deterministic-test', primaryLanguage: 'TypeScript' })
    const config = makeWorkflowConfig()
    expect(buildArchitectPrompt(fp, config)).toBe(buildArchitectPrompt(fp, config))
  })
})

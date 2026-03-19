import { describe, expect, it } from 'vitest'
import { buildAnalysisPrompt } from '../../src/core/fingerprint/prompt-builder.js'
import {
  AIAnalysisResponse,
  detectAICLIs,
  normaliseAnalysisResponse,
  stripJsonFences,
} from '../../src/core/fingerprint/ai-collector.js'

// ─── buildAnalysisPrompt ──────────────────────────────────────────────────────

describe('buildAnalysisPrompt', () => {
  it('includes the repo name', () => {
    const prompt = buildAnalysisPrompt('my-repo', [], new Map())
    expect(prompt).toContain('my-repo')
  })

  it('includes all file tree entries when under 500', () => {
    const tree = ['src/index.ts', 'package.json', 'README.md']
    const prompt = buildAnalysisPrompt('repo', tree, new Map())
    expect(prompt).toContain('src/index.ts')
    expect(prompt).toContain('package.json')
    expect(prompt).toContain('README.md')
  })

  it('truncates file tree at 500 entries with a count note', () => {
    const tree = Array.from({ length: 600 }, (_, i) => `src/file${i}.ts`)
    const prompt = buildAnalysisPrompt('repo', tree, new Map())
    expect(prompt).toContain('src/file0.ts')
    expect(prompt).toContain('src/file499.ts')
    expect(prompt).not.toContain('src/file500.ts')
    expect(prompt).toContain('100 more files not shown')
  })

  it('includes config file contents with === filename === header', () => {
    const contents = new Map([['package.json', '{"name":"foo"}']])
    const prompt = buildAnalysisPrompt('repo', [], contents)
    expect(prompt).toContain('=== package.json ===')
    expect(prompt).toContain('{"name":"foo"}')
  })

  it('shows fallback text when no config files', () => {
    const prompt = buildAnalysisPrompt('repo', [], new Map())
    expect(prompt).toContain('(no config files found)')
  })

  it('includes the file tree count', () => {
    const tree = ['a.ts', 'b.ts']
    const prompt = buildAnalysisPrompt('repo', tree, new Map())
    expect(prompt).toContain('2 files')
  })

  it('instructs the AI to return only JSON', () => {
    const prompt = buildAnalysisPrompt('repo', [], new Map())
    expect(prompt).toContain('Return ONLY a JSON object')
    expect(prompt).toContain('no markdown fences')
  })

  it('specifies confidence must be high/medium/low', () => {
    const prompt = buildAnalysisPrompt('repo', [], new Map())
    expect(prompt).toContain('"high", "medium", or "low"')
  })

  it('includes multiple config file contents', () => {
    const contents = new Map([
      ['package.json', '{"name":"foo"}'],
      ['tsconfig.json', '{"strict":true}'],
    ])
    const prompt = buildAnalysisPrompt('repo', [], contents)
    expect(prompt).toContain('=== package.json ===')
    expect(prompt).toContain('=== tsconfig.json ===')
    expect(prompt).toContain('{"strict":true}')
  })
})

// ─── AIAnalysisResponse (Zod schema) ─────────────────────────────────────────

describe('AIAnalysisResponse', () => {
  it('parses a complete valid response', () => {
    const raw = {
      languages: [
        { name: 'TypeScript', confidence: 'high', percentage: 90, evidence: ['tsconfig.json'] },
      ],
      frameworks: [
        { name: 'Next.js', confidence: 'high', category: 'fullstack', evidence: [] },
      ],
      conventions: [],
      dependencies: [{ runtime: { react: '^18' }, dev: {}, peer: {}, sourceFile: 'package.json' }],
      testing: { framework: 'vitest', confidence: 'high' },
      architecture: { style: 'monolith' },
      description: 'A web app',
    }
    const result = AIAnalysisResponse.parse(raw)
    expect(result.languages[0]?.name).toBe('TypeScript')
    expect(result.frameworks[0]?.name).toBe('Next.js')
    expect(result.testing?.framework).toBe('vitest')
    expect(result.description).toBe('A web app')
  })

  it('defaults arrays to [] when omitted', () => {
    const result = AIAnalysisResponse.parse({})
    expect(result.languages).toEqual([])
    expect(result.frameworks).toEqual([])
    expect(result.conventions).toEqual([])
    expect(result.dependencies).toEqual([])
  })

  it('defaults architecture to { style: "unknown" } when omitted', () => {
    const result = AIAnalysisResponse.parse({})
    expect(result.architecture.style).toBe('unknown')
  })

  it('accepts optional testing field as undefined when omitted', () => {
    const result = AIAnalysisResponse.parse({})
    expect(result.testing).toBeUndefined()
  })

  it('accepts optional cicd field as undefined when omitted', () => {
    const result = AIAnalysisResponse.parse({})
    expect(result.cicd).toBeUndefined()
  })

  it('accepts optional linting field as undefined when omitted', () => {
    const result = AIAnalysisResponse.parse({})
    expect(result.linting).toBeUndefined()
  })

  it('accepts optional description as undefined when omitted', () => {
    const result = AIAnalysisResponse.parse({})
    expect(result.description).toBeUndefined()
  })

  it('rejects invalid confidence value', () => {
    expect(() =>
      AIAnalysisResponse.parse({
        languages: [{ name: 'Go', confidence: 'very high', percentage: 80, evidence: [] }],
      }),
    ).toThrow()
  })

  it('rejects non-number percentage', () => {
    expect(() =>
      AIAnalysisResponse.parse({
        languages: [{ name: 'Go', confidence: 'high', percentage: 'a lot', evidence: [] }],
      }),
    ).toThrow()
  })

  it('defaults language.primary to false if omitted', () => {
    const result = AIAnalysisResponse.parse({
      languages: [{ name: 'Python', confidence: 'high', percentage: 100, evidence: [] }],
    })
    expect(result.languages[0]?.primary).toBe(false)
  })

  it('defaults language.evidence to [] if omitted', () => {
    const result = AIAnalysisResponse.parse({
      languages: [{ name: 'Python', confidence: 'high', percentage: 100 }],
    })
    expect(result.languages[0]?.evidence).toEqual([])
  })
})

// ─── detectAICLIs ─────────────────────────────────────────────────────────────

describe('detectAICLIs', () => {
  it('detects Claude Code via CLAUDE.md in configFiles', () => {
    const configFiles = new Map([['CLAUDE.md', '/repo/CLAUDE.md']])
    const signals = detectAICLIs([], configFiles)
    expect(signals).toHaveLength(1)
    expect(signals[0]?.tool).toBe('claude_code')
    expect(signals[0]?.confidence).toBe('high')
    expect(signals[0]?.evidence).toContain('CLAUDE.md found')
  })

  it('detects Claude Code via .claude/ directory in fileTree', () => {
    const fileTree = ['.claude/commands/commit.md', '.claude/settings.json']
    const signals = detectAICLIs(fileTree, new Map())
    expect(signals).toHaveLength(1)
    expect(signals[0]?.tool).toBe('claude_code')
    expect(signals[0]?.evidence).toContain('.claude/ directory found')
  })

  it('detects Claude Code with both CLAUDE.md and .claude/ dir', () => {
    const configFiles = new Map([['CLAUDE.md', '/repo/CLAUDE.md']])
    const fileTree = ['.claude/settings.json']
    const signals = detectAICLIs(fileTree, configFiles)
    expect(signals).toHaveLength(1)
    expect(signals[0]?.tool).toBe('claude_code')
    expect(signals[0]?.evidence).toHaveLength(2)
  })

  it('detects Copilot via .github/copilot-instructions.md', () => {
    const configFiles = new Map([
      ['copilot-instructions.md', '/repo/.github/copilot-instructions.md'],
    ])
    const signals = detectAICLIs([], configFiles)
    expect(signals).toHaveLength(1)
    expect(signals[0]?.tool).toBe('copilot')
    expect(signals[0]?.evidence).toContain('.github/copilot-instructions.md found')
  })

  it('does not detect Copilot if copilot-instructions.md is not in .github/', () => {
    const configFiles = new Map([
      ['copilot-instructions.md', '/repo/copilot-instructions.md'],
    ])
    const signals = detectAICLIs([], configFiles)
    expect(signals.some((s) => s.tool === 'copilot')).toBe(false)
  })

  it('detects Cursor via .cursorrules in configFiles', () => {
    const configFiles = new Map([['.cursorrules', '/repo/.cursorrules']])
    const signals = detectAICLIs([], configFiles)
    expect(signals).toHaveLength(1)
    expect(signals[0]?.tool).toBe('cursor')
    expect(signals[0]?.evidence).toContain('.cursorrules found')
  })

  it('detects Cursor via .cursor/ directory in fileTree', () => {
    const fileTree = ['.cursor/rules/default.md']
    const signals = detectAICLIs(fileTree, new Map())
    expect(signals).toHaveLength(1)
    expect(signals[0]?.tool).toBe('cursor')
    expect(signals[0]?.evidence).toContain('.cursor/ directory found')
  })

  it('detects multiple AI CLIs simultaneously', () => {
    const configFiles = new Map([
      ['CLAUDE.md', '/repo/CLAUDE.md'],
      ['.cursorrules', '/repo/.cursorrules'],
      ['copilot-instructions.md', '/repo/.github/copilot-instructions.md'],
    ])
    const signals = detectAICLIs([], configFiles)
    expect(signals).toHaveLength(3)
    const tools = signals.map((s) => s.tool)
    expect(tools).toContain('claude_code')
    expect(tools).toContain('cursor')
    expect(tools).toContain('copilot')
  })

  it('returns empty array when no AI CLIs detected', () => {
    const signals = detectAICLIs(['src/main.ts', 'package.json'], new Map())
    expect(signals).toEqual([])
  })
})

// ─── normaliseAnalysisResponse ────────────────────────────────────────────────

describe('normaliseAnalysisResponse', () => {
  it('passes through a conforming response unchanged', () => {
    const conforming = {
      languages: [{ name: 'Go', confidence: 'high', percentage: 100, evidence: [] }],
      frameworks: [],
      architecture: { style: 'cli' },
    }
    const result = normaliseAnalysisResponse(conforming)
    expect(result.languages).toEqual(conforming.languages)
  })

  it('maps primary_language to languages array', () => {
    const raw = { primary_language: 'Python' }
    const result = normaliseAnalysisResponse(raw)
    expect(result.languages).toHaveLength(1)
    expect(result.languages[0].name).toBe('Python')
    expect(result.languages[0].percentage).toBe(100)
  })

  it('maps framework string to frameworks array', () => {
    const raw = { framework: 'Plotly Dash' }
    const result = normaliseAnalysisResponse(raw)
    expect(result.frameworks).toHaveLength(1)
    expect(result.frameworks[0].name).toBe('Plotly Dash')
  })

  it('maps key_dependencies string array to dependencies', () => {
    const raw = { key_dependencies: ['dash', 'plotly', 'pyodbc'] }
    const result = normaliseAnalysisResponse(raw)
    expect(result.dependencies).toHaveLength(1)
    expect(result.dependencies[0].runtime).toEqual({ dash: '*', plotly: '*', pyodbc: '*' })
  })

  it('maps architecture.pattern to architecture.style', () => {
    const raw = { architecture: { pattern: 'Layered MVC' } }
    const result = normaliseAnalysisResponse(raw)
    expect(result.architecture.style).toBe('Layered MVC')
  })

  it('maps entry_points into architecture.entryPoints', () => {
    const raw = { architecture: { pattern: 'cli' }, entry_points: ['main.py'] }
    const result = normaliseAnalysisResponse(raw)
    expect(result.architecture.entryPoints).toEqual(['main.py'])
  })

  it('handles copilot-style response end-to-end with Zod', () => {
    const copilotResponse = {
      name: 'DashDataDiscovery',
      description: 'A Dash-based web app',
      primary_language: 'Python',
      framework: 'Plotly Dash',
      key_dependencies: ['dash', 'plotly'],
      architecture: { pattern: 'Layered MVC' },
      entry_points: ['main.py'],
    }
    const normalised = normaliseAnalysisResponse(copilotResponse)
    const parsed = AIAnalysisResponse.parse(normalised)
    expect(parsed.languages[0]?.name).toBe('Python')
    expect(parsed.frameworks[0]?.name).toBe('Plotly Dash')
    expect(parsed.architecture.style).toBe('Layered MVC')
    expect(parsed.architecture.entryPoints).toEqual(['main.py'])
    expect(parsed.description).toBe('A Dash-based web app')
  })
})

// ─── stripJsonFences ──────────────────────────────────────────────────────────

describe('stripJsonFences', () => {
  it('strips ```json ... ``` fences', () => {
    const input = '```json\n{"a":1}\n```'
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('strips ``` ... ``` fences without language tag', () => {
    const input = '```\n{"a":1}\n```'
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('leaves plain JSON unchanged', () => {
    const input = '{"a":1}'
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('trims surrounding whitespace', () => {
    const input = '  {"a":1}  '
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('strips fences with trailing whitespace', () => {
    const input = '```json\n{"a":1}\n```  '
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('handles multi-line JSON', () => {
    const input = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```'
    expect(stripJsonFences(input)).toBe('{\n  "a": 1,\n  "b": 2\n}')
  })

  it('handles fence with no newline after opening', () => {
    const input = '```json{"a":1}\n```'
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('extracts JSON from natural-language preamble (copilot-style response)', () => {
    const input = 'it looks like this is a TypeScript project. Here is the analysis:\n{"a":1}'
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })

  it('extracts JSON when prose appears after the object too', () => {
    const input = 'Sure! Here you go:\n{"a":1}\nLet me know if you need anything else.'
    expect(stripJsonFences(input)).toBe('{"a":1}')
  })
})

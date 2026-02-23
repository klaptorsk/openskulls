import { afterEach, describe, expect, it } from 'vitest'
import { TypeScriptAnalyzer } from '../../src/core/analyzers/language/typescript.js'
import { makeContext, type TestFixture } from '../helpers/index.js'

const analyzer = new TypeScriptAnalyzer()

let fixture: TestFixture

afterEach(() => fixture?.cleanup())

// ─── canRun ───────────────────────────────────────────────────────────────────

describe('canRun', () => {
  it('triggers on tsconfig.json', () => {
    fixture = makeContext({ 'tsconfig.json': '{}' })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('triggers when typescript is in devDependencies even without tsconfig', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }),
    })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('triggers when typescript is in dependencies', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ dependencies: { typescript: '^5.0.0' } }),
    })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('does not trigger without tsconfig.json or typescript dep', () => {
    fixture = makeContext({ 'package.json': JSON.stringify({ dependencies: { express: '^4.0.0' } }) })
    expect(analyzer.canRun(fixture.ctx)).toBe(false)
  })
})

// ─── Language signal ──────────────────────────────────────────────────────────

describe('language signal', () => {
  it('emits TypeScript language signal for .ts files', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'src/index.ts': '',
      'src/utils.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages).toHaveLength(1)
    expect(result.languages![0]!.name).toBe('TypeScript')
  })

  it('includes .tsx files in the count', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'App.tsx': '',
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const lang = result.languages![0]!
    expect(lang.name).toBe('TypeScript')
    // 2 TS files, 0 JS → 100%
    expect(lang.percentage).toBe(100)
  })

  it('computes correct percentage against mixed JS+TS', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'a.ts': '', 'b.ts': '',    // 2 TS
      'c.js': '',                 // 1 JS
    })
    const result = analyzer.analyze(fixture.ctx)
    const lang = result.languages![0]!
    // 2 / 3 = 66.7%
    expect(lang.percentage).toBeCloseTo(66.7, 0)
  })

  it('returns confidence: high when tsconfig.json is present', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.confidence).toBe('high')
  })

  it('returns confidence: medium when triggered via package.json only', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.confidence).toBe('medium')
  })

  it('emits 100% TypeScript signal when tsconfig exists but no source files yet', () => {
    fixture = makeContext({ 'tsconfig.json': '{}' })
    const result = analyzer.analyze(fixture.ctx)
    // tsconfig present, no source files → fresh project, emit TS signal at 100%
    expect(result.languages).toHaveLength(1)
    expect(result.languages![0]!.percentage).toBe(100)
  })
})

// ─── Version detection ────────────────────────────────────────────────────────

describe('version detection', () => {
  it('reads TypeScript version from devDependencies', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'package.json': JSON.stringify({ devDependencies: { typescript: '^5.5.4' } }),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBe('5.5')
  })

  it('reads TypeScript version from dependencies', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'package.json': JSON.stringify({ dependencies: { typescript: '5.4.2' } }),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBe('5.4')
  })

  it('sets version to undefined when typescript is not in package.json', () => {
    fixture = makeContext({
      'tsconfig.json': '{}',
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBeUndefined()
  })
})

// ─── Strict mode ─────────────────────────────────────────────────────────────

describe('strict mode', () => {
  it('emits typescript_strict convention when strict: true in compilerOptions', () => {
    fixture = makeContext({
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const strict = result.conventions?.find((c) => c.name === 'typescript_strict')
    expect(strict).toBeDefined()
    expect(strict?.value).toBe('true')
  })

  it('emits no typescript_strict convention when strict is false', () => {
    fixture = makeContext({
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: false } }),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const strict = result.conventions?.find((c) => c.name === 'typescript_strict')
    expect(strict).toBeUndefined()
  })

  it('emits no typescript_strict convention when compilerOptions is absent', () => {
    fixture = makeContext({
      'tsconfig.json': JSON.stringify({}),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.conventions ?? []).toHaveLength(0)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { JavaScriptAnalyzer } from '../../src/core/analyzers/language/javascript.js'
import { makeContext, type TestFixture } from '../helpers/index.js'

const analyzer = new JavaScriptAnalyzer()

let fixture: TestFixture

afterEach(() => fixture?.cleanup())

// ─── canRun ───────────────────────────────────────────────────────────────────

describe('canRun', () => {
  it('triggers on package.json', () => {
    fixture = makeContext({ 'package.json': '{}' })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('does not trigger without package.json', () => {
    fixture = makeContext({ 'go.mod': 'module example' })
    expect(analyzer.canRun(fixture.ctx)).toBe(false)
  })
})

// ─── Framework detection ─────────────────────────────────────────────────────

describe('framework detection', () => {
  it('detects React from dependencies', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
      }),
      'src/App.jsx': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('React')
  })

  it('detects Next.js and emits fullstack category', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        dependencies: { next: '14.2.0', react: '^18.2.0' },
      }),
      'app/page.tsx': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const next = result.frameworks?.find((f) => f.name === 'Next.js')
    expect(next).toBeDefined()
    expect(next?.category).toBe('fullstack')
  })

  it('deduplicates — nuxt and @nuxtjs/nuxt emit only one Nuxt entry', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        dependencies: { nuxt: '^3.0.0', '@nuxtjs/nuxt': '^3.0.0' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    const nuxtEntries = result.frameworks?.filter((f) => f.name === 'Nuxt') ?? []
    expect(nuxtEntries).toHaveLength(1)
  })

  it('detects Prisma from devDependencies', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        dependencies: { '@prisma/client': '^5.0.0' },
        devDependencies: { prisma: '^5.0.0' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('Prisma')
  })

  it('extracts version from dependency entry', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        dependencies: { express: '^4.18.2' },
      }),
      'index.js': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const express = result.frameworks?.find((f) => f.name === 'Express')
    expect(express?.version).toBe('4.18')
  })
})

// ─── Testing detection ────────────────────────────────────────────────────────

describe('testing detection', () => {
  it('detects vitest', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('vitest')
    expect(result.testing?.pattern).toBe('**/*.test.ts')
  })

  it('detects jest with typescript pattern when typescript is also a dep', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('jest')
    expect(result.testing?.pattern).toBe('**/*.test.ts')
  })

  it('detects jest with JS pattern when typescript is absent', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('jest')
    expect(result.testing?.pattern).toBe('**/*.test.js')
  })

  it('detects Playwright', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        devDependencies: { '@playwright/test': '^1.40.0' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('Playwright')
  })

  it('prefers vitest over jest when both present', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        devDependencies: { vitest: '^2.0.0', jest: '^29.0.0' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('vitest')
  })
})

// ─── Linting detection ────────────────────────────────────────────────────────

describe('linting detection', () => {
  it('detects eslint', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ devDependencies: { eslint: '^9.0.0' } }),
      'eslint.config.js': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.linting?.tools).toContain('eslint')
  })

  it('detects prettier and its config file', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ devDependencies: { prettier: '^3.0.0' } }),
      '.prettierrc': '{}',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.linting?.tools).toContain('prettier')
    expect(result.linting?.configFiles).toContain('.prettierrc')
  })

  it('detects both eslint and prettier', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        devDependencies: { eslint: '^9.0.0', prettier: '^3.0.0' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.linting?.tools).toContain('eslint')
    expect(result.linting?.tools).toContain('prettier')
  })

  it('returns no linting signal when no linting tools detected', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ dependencies: { express: '^4.18.0' } }),
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.linting).toBeUndefined()
  })
})

// ─── Package manager detection ────────────────────────────────────────────────

describe('package manager detection', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({}),
      'pnpm-lock.yaml': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const pm = result.conventions?.find((c) => c.name === 'package_manager')
    expect(pm?.value).toBe('pnpm')
  })

  it('detects yarn from yarn.lock', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({}),
      'yarn.lock': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const pm = result.conventions?.find((c) => c.name === 'package_manager')
    expect(pm?.value).toBe('yarn')
  })

  it('detects bun from bun.lockb', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({}),
      'bun.lockb': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const pm = result.conventions?.find((c) => c.name === 'package_manager')
    expect(pm?.value).toBe('bun')
  })

  it('falls back to npm when no lock file', () => {
    fixture = makeContext({ 'package.json': JSON.stringify({}) })
    const result = analyzer.analyze(fixture.ctx)
    const pm = result.conventions?.find((c) => c.name === 'package_manager')
    expect(pm?.value).toBe('npm')
  })

  it('detects pnpm from packageManager field when no lockfile', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.0.0' }),
    })
    const result = analyzer.analyze(fixture.ctx)
    const pm = result.conventions?.find((c) => c.name === 'package_manager')
    expect(pm?.value).toBe('pnpm')
  })
})

// ─── Language signal ─────────────────────────────────────────────────────────

describe('JavaScript language signal', () => {
  it('emits JS signal when .js files are present', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({}),
      'index.js': '',
      'utils.js': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages).toHaveLength(1)
    expect(result.languages![0]!.name).toBe('JavaScript')
  })

  it('emits no JS language signal when only .ts files present', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({}),
      'index.ts': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages).toHaveLength(0)
  })

  it('computes correct percentage when mixed JS/TS files', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({}),
      'a.js': '', 'b.js': '',    // 2 JS
      'c.ts': '', 'd.ts': '',    // 2 TS
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.percentage).toBe(50)
  })
})

// ─── Dependencies passthrough ─────────────────────────────────────────────────

describe('dependencies', () => {
  it('passes through runtime and dev deps', () => {
    fixture = makeContext({
      'package.json': JSON.stringify({
        dependencies: { express: '^4.18.0' },
        devDependencies: { vitest: '^2.0.0' },
        peerDependencies: { react: '>=17' },
      }),
    })
    const result = analyzer.analyze(fixture.ctx)
    const dep = result.dependencies?.[0]
    expect(dep?.runtime['express']).toBe('^4.18.0')
    expect(dep?.dev['vitest']).toBe('^2.0.0')
    expect(dep?.peer['react']).toBe('>=17')
  })
})

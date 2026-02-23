import { afterEach, describe, expect, it } from 'vitest'
import { GoAnalyzer } from '../../src/core/analyzers/language/go.js'
import { makeContext, type TestFixture } from '../helpers/index.js'

const analyzer = new GoAnalyzer()

let fixture: TestFixture

afterEach(() => fixture?.cleanup())

// ─── canRun ───────────────────────────────────────────────────────────────────

describe('canRun', () => {
  it('triggers on go.mod', () => {
    fixture = makeContext({ 'go.mod': 'module example\ngo 1.21\n' })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('does not trigger without go.mod', () => {
    fixture = makeContext({ 'package.json': '{}' })
    expect(analyzer.canRun(fixture.ctx)).toBe(false)
  })
})

// ─── Basic parsing ────────────────────────────────────────────────────────────

describe('basic go.mod parsing', () => {
  it('detects Go version', () => {
    fixture = makeContext({
      'go.mod': 'module github.com/example/app\ngo 1.22\n',
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBe('1.22')
  })

  it('detects Go version with patch', () => {
    fixture = makeContext({
      'go.mod': 'module github.com/example/app\ngo 1.21.5\n',
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBe('1.21.5')
  })

  it('detects module name and includes it in evidence', () => {
    fixture = makeContext({
      'go.mod': 'module github.com/acme/service\ngo 1.22\n',
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const evidence = result.languages![0]!.evidence
    expect(evidence.some((e) => e.includes('github.com/acme/service'))).toBe(true)
  })

  it('emits confidence: high', () => {
    fixture = makeContext({
      'go.mod': 'module example\ngo 1.22\n',
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.confidence).toBe('high')
  })
})

// ─── Multiline require blocks ─────────────────────────────────────────────────

describe('multiline require block', () => {
  it('detects Gin framework from multiline require block', () => {
    fixture = makeContext({
      'go.mod': `module github.com/example/app
go 1.22

require (
  github.com/gin-gonic/gin v1.9.1
  github.com/stretchr/testify v1.8.4 // indirect
)
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('Gin')
  })

  it('places indirect deps in dev bucket', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require (
  github.com/gin-gonic/gin v1.9.1
  golang.org/x/net v0.20.0 // indirect
)
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const dep = result.dependencies?.[0]
    expect(dep?.runtime['github.com/gin-gonic/gin']).toBe('v1.9.1')
    expect(dep?.dev['golang.org/x/net']).toBe('v0.20.0')
  })

  it('places test packages in dev bucket', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require (
  github.com/stretchr/testify v1.8.4
)
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const dep = result.dependencies?.[0]
    // "testify" includes "test" in the key → goes to dev
    expect(dep?.dev['github.com/stretchr/testify']).toBe('v1.8.4')
  })
})

// ─── Single-line require ──────────────────────────────────────────────────────

describe('single-line require', () => {
  it('parses single-line require statement', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require github.com/labstack/echo/v4 v4.11.4
require github.com/rs/zerolog v1.31.0
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const dep = result.dependencies?.[0]
    expect(dep?.runtime['github.com/labstack/echo/v4']).toBe('v4.11.4')
  })

  it('detects Echo framework from single-line require', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22
require github.com/labstack/echo v4.11.4
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('Echo')
  })
})

// ─── Framework detection ──────────────────────────────────────────────────────

describe('framework detection', () => {
  it('detects GORM ORM', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require (
  gorm.io/gorm v1.25.5
  gorm.io/driver/postgres v1.5.4
)
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('GORM')
  })

  it('detects gRPC', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require (
  google.golang.org/grpc v1.59.0
)
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('gRPC')
  })

  it('detects Cobra CLI', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require github.com/spf13/cobra v1.8.0
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('Cobra')
  })

  it('attaches version to framework signal', () => {
    fixture = makeContext({
      'go.mod': `module example
go 1.22

require (
  github.com/gin-gonic/gin v1.9.1
)
`,
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const gin = result.frameworks?.find((f) => f.name === 'Gin')
    expect(gin?.version).toBe('v1.9.1')
  })
})

// ─── File counting ────────────────────────────────────────────────────────────

describe('file counting', () => {
  it('counts .go files in fileTree', () => {
    fixture = makeContext({
      'go.mod': 'module example\ngo 1.22\n',
      'main.go': '',
      'handler.go': '',
      'config.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const evidence = result.languages![0]!.evidence
    expect(evidence.some((e) => e.includes('3 .go files'))).toBe(true)
  })

  it('computes percentage against mixed-language source tree', () => {
    fixture = makeContext({
      'go.mod': 'module example\ngo 1.22\n',
      'main.go': '',    // 1 Go file
      'index.ts': '',   // 1 TS file
      'utils.ts': '',   // 1 TS file
    })
    const result = analyzer.analyze(fixture.ctx)
    const lang = result.languages![0]!
    // 1 go / 3 source = 33.3%
    expect(lang.percentage).toBeCloseTo(33.3, 0)
  })
})

// ─── Architecture patch ──────────────────────────────────────────────────────

describe('architecturePatch', () => {
  it('emits monolith style when module name is present', () => {
    fixture = makeContext({
      'go.mod': 'module github.com/example/app\ngo 1.22\n',
      'main.go': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.architecturePatch?.style).toBe('monolith')
  })
})

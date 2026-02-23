import { afterEach, describe, expect, it } from 'vitest'
import { PythonAnalyzer } from '../../src/core/analyzers/language/python.js'
import { makeContext, type TestFixture } from '../helpers/index.js'

const analyzer = new PythonAnalyzer()

let fixture: TestFixture

afterEach(() => fixture?.cleanup())

// ─── canRun ───────────────────────────────────────────────────────────────────

describe('canRun', () => {
  it('triggers on pyproject.toml', () => {
    fixture = makeContext({ 'pyproject.toml': '' })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('triggers on requirements.txt', () => {
    fixture = makeContext({ 'requirements.txt': '' })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('triggers on setup.py', () => {
    fixture = makeContext({ 'setup.py': '' })
    expect(analyzer.canRun(fixture.ctx)).toBe(true)
  })

  it('does not trigger on unrelated files', () => {
    fixture = makeContext({ 'package.json': '{}' })
    expect(analyzer.canRun(fixture.ctx)).toBe(false)
  })
})

// ─── pyproject.toml (PEP 517 / 518) ──────────────────────────────────────────

describe('pyproject.toml — PEP 518 format', () => {
  it('detects Python version from requires-python', () => {
    fixture = makeContext({
      'pyproject.toml': `
[project]
name = "myapp"
requires-python = ">=3.11"
dependencies = []
`,
      'main.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages).toHaveLength(1)
    expect(result.languages![0]!.version).toBe('3.11')
  })

  it('detects framework from [project] dependencies', () => {
    fixture = makeContext({
      'pyproject.toml': `
[project]
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.100.0",
  "pydantic>=2.0",
]
`,
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('FastAPI')
    expect(names).toContain('Pydantic')
  })

  it('detects pytest from [tool.pytest.ini_options]', () => {
    fixture = makeContext({
      'pyproject.toml': `
[project]
requires-python = ">=3.11"
dependencies = []

[tool.pytest.ini_options]
testpaths = ["tests"]
`,
      'test_app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('pytest')
    expect(result.testing?.pattern).toBe('tests/**/*.py')
  })

  it('detects linting tools from [tool.*]', () => {
    fixture = makeContext({
      'pyproject.toml': `
[project]
dependencies = []

[tool.ruff]
line-length = 120

[tool.mypy]
strict = true
`,
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.linting?.tools).toContain('ruff')
    expect(result.linting?.tools).toContain('mypy')
  })

  it('reports confidence: high when pyproject.toml is present', () => {
    fixture = makeContext({
      'pyproject.toml': '[project]\ndependencies = []',
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.confidence).toBe('high')
  })
})

// ─── pyproject.toml (Poetry) ─────────────────────────────────────────────────

describe('pyproject.toml — Poetry format', () => {
  it('detects Python version from [tool.poetry.dependencies] python key', () => {
    fixture = makeContext({
      'pyproject.toml': `
[tool.poetry]
name = "myapp"

[tool.poetry.dependencies]
python = "^3.12"
flask = "^3.0"
`,
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBe('3.12')
  })

  it('detects framework from [tool.poetry.dependencies]', () => {
    fixture = makeContext({
      'pyproject.toml': `
[tool.poetry.dependencies]
python = "^3.12"
django = "^4.2"

[tool.poetry.dev-dependencies]
pytest = "^8.0"
`,
      'manage.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('Django')
  })

  it('places dev-dependencies in dev bucket', () => {
    fixture = makeContext({
      'pyproject.toml': `
[tool.poetry.dependencies]
python = "^3.12"
flask = "^3.0"

[tool.poetry.dev-dependencies]
pytest = "^8.0"
`,
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const dep = result.dependencies?.[0]
    expect(dep?.dev['pytest']).toBeDefined()
    expect(dep?.runtime['flask']).toBeDefined()
  })
})

// ─── requirements.txt ────────────────────────────────────────────────────────

describe('requirements.txt', () => {
  it('parses simple pinned deps', () => {
    fixture = makeContext({
      'requirements.txt': `
# production dependencies
django==4.2.7
gunicorn==21.2.0
psycopg2-binary==2.9.9
`,
      'manage.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const deps = result.dependencies?.[0]?.runtime ?? {}
    expect(deps['django']).toBe('==4.2.7')
    expect(deps['gunicorn']).toBe('==21.2.0')
  })

  it('skips comment lines and flags', () => {
    fixture = makeContext({
      'requirements.txt': `
# This is a comment
-r base.txt
flask>=3.0
`,
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const deps = result.dependencies?.[0]?.runtime ?? {}
    expect(Object.keys(deps)).not.toContain('-r')
    expect(deps['flask']).toBeDefined()
  })

  it('detects framework from requirements.txt deps', () => {
    fixture = makeContext({
      'requirements.txt': 'fastapi>=0.100.0\nuvicorn>=0.24.0',
      'main.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    const names = result.frameworks?.map((f) => f.name) ?? []
    expect(names).toContain('FastAPI')
  })
})

// ─── .python-version ─────────────────────────────────────────────────────────

describe('.python-version', () => {
  it('reads Python version from .python-version when no pyproject.toml', () => {
    fixture = makeContext({
      'requirements.txt': 'requests==2.31.0',
      '.python-version': '3.12.3',
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.languages![0]!.version).toBe('3.12.3')
  })
})

// ─── File counting & percentage ──────────────────────────────────────────────

describe('language signal', () => {
  it('counts .py files and computes percentage', () => {
    fixture = makeContext({
      'requirements.txt': '',
      'app.py': '',
      'models.py': '',
      'index.ts': '',  // non-Python source file
    })
    const result = analyzer.analyze(fixture.ctx)
    const lang = result.languages?.[0]
    expect(lang?.name).toBe('Python')
    // 2 py / 3 source = 66.7%
    expect(lang?.percentage).toBeCloseTo(66.7, 0)
  })

  it('returns empty languages array when no Python indicators', () => {
    fixture = makeContext({ 'requirements.txt': '' })
    const result = analyzer.analyze(fixture.ctx)
    // No .py files and no pyproject.toml or setup.py → hasPython = false
    expect(result.languages).toHaveLength(0)
  })
})

// ─── Standalone lint configs ─────────────────────────────────────────────────

describe('standalone linting config files', () => {
  it('detects ruff from ruff.toml', () => {
    fixture = makeContext({
      'requirements.txt': '',
      'ruff.toml': '[lint]\nselect = ["E", "F"]',
      'app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.linting?.tools).toContain('ruff')
  })

  it('detects pytest from pytest.ini', () => {
    fixture = makeContext({
      'requirements.txt': '',
      'pytest.ini': '[pytest]\ntestpaths = tests',
      'test_app.py': '',
    })
    const result = analyzer.analyze(fixture.ctx)
    expect(result.testing?.framework).toBe('pytest')
  })
})

/**
 * Python language analyzer.
 *
 * Triggers on: pyproject.toml, setup.py, requirements.txt, setup.cfg
 * Detects: language signal, version, frameworks, dependencies, testing, linting
 */

import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import { BaseAnalyzer, countFilesWithExtension } from '../base.js'
import type { AnalyzerContext, AnalyzerResult } from '../base.js'
import type { DependencyMap, FrameworkSignal, LintingSignal, TestingSignal } from '../../fingerprint/types.js'

// ─── Framework map ────────────────────────────────────────────────────────────

const FRAMEWORK_MAP = new Map<string, { name: string; category: string }>([
  ['fastapi',       { name: 'FastAPI',                  category: 'backend'    }],
  ['django',        { name: 'Django',                   category: 'backend'    }],
  ['flask',         { name: 'Flask',                    category: 'backend'    }],
  ['starlette',     { name: 'Starlette',                category: 'backend'    }],
  ['litestar',      { name: 'Litestar',                 category: 'backend'    }],
  ['tornado',       { name: 'Tornado',                  category: 'backend'    }],
  ['aiohttp',       { name: 'aiohttp',                  category: 'backend'    }],
  ['sqlalchemy',    { name: 'SQLAlchemy',               category: 'orm'        }],
  ['tortoise-orm',  { name: 'Tortoise ORM',             category: 'orm'        }],
  ['pydantic',      { name: 'Pydantic',                 category: 'validation' }],
  ['celery',        { name: 'Celery',                   category: 'background' }],
  ['dramatiq',      { name: 'Dramatiq',                 category: 'background' }],
  ['typer',         { name: 'Typer',                    category: 'cli'        }],
  ['click',         { name: 'Click',                    category: 'cli'        }],
  ['numpy',         { name: 'NumPy',                    category: 'data'       }],
  ['pandas',        { name: 'Pandas',                   category: 'data'       }],
  ['torch',         { name: 'PyTorch',                  category: 'ml'         }],
  ['tensorflow',    { name: 'TensorFlow',               category: 'ml'         }],
  ['transformers',  { name: 'Transformers (HuggingFace)', category: 'ml'       }],
])

// ─── Analyzer ────────────────────────────────────────────────────────────────

export class PythonAnalyzer extends BaseAnalyzer {
  readonly id = 'python'
  readonly triggerFiles = ['pyproject.toml', 'setup.py', 'requirements.txt', 'setup.cfg']
  readonly priority = 5

  analyze(ctx: AnalyzerContext): AnalyzerResult {
    const pyFiles = countFilesWithExtension(ctx, '.py')
    const allSourceFiles = countSourceFiles(ctx)
    const percentage = allSourceFiles > 0 ? round((pyFiles / allSourceFiles) * 100) : 0

    const evidence: string[] = []
    const runtime: Record<string, string> = {}
    const dev: Record<string, string> = {}
    const frameworks: FrameworkSignal[] = []
    const lintingTools: string[] = []
    const lintingConfigs: string[] = []
    let pythonVersion: string | undefined
    let testing: TestingSignal | undefined

    // ── pyproject.toml ───────────────────────────────────────────────────────
    const pyprojectPath = ctx.configFiles.get('pyproject.toml')
    if (pyprojectPath) {
      evidence.push('pyproject.toml found')
      try {
        const data = parseToml(readFileSync(pyprojectPath, 'utf-8')) as Record<string, unknown>
        const project = data['project'] as Record<string, unknown> | undefined
        const tool = data['tool'] as Record<string, unknown> | undefined

        // Python version from [project] requires-python
        const reqPython = project?.['requires-python'] as string | undefined
        if (reqPython) {
          pythonVersion = reqPython.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1]
          evidence.push(`requires-python: ${reqPython}`)
        }

        // [project] dependencies
        for (const dep of (project?.['dependencies'] as string[] | undefined) ?? []) {
          const [name, ver] = splitDep(dep)
          if (name) runtime[name] = ver
        }

        // [project.optional-dependencies]
        const optDeps = project?.['optional-dependencies'] as Record<string, string[]> | undefined
        if (optDeps) {
          for (const group of Object.values(optDeps)) {
            for (const dep of group) {
              const [name, ver] = splitDep(dep)
              if (name) dev[name] = ver
            }
          }
        }

        // Poetry: [tool.poetry.dependencies]
        const poetry = tool?.['poetry'] as Record<string, unknown> | undefined
        const poetryDeps = poetry?.['dependencies'] as Record<string, unknown> | undefined
        if (poetryDeps) {
          for (const [name, ver] of Object.entries(poetryDeps)) {
            if (name === 'python') {
              if (!pythonVersion && typeof ver === 'string') {
                pythonVersion = ver.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1]
              }
              continue
            }
            runtime[name.toLowerCase()] = typeof ver === 'string' ? ver : '*'
          }
          const poetryGroup = poetry?.['group'] as Record<string, Record<string, unknown>> | undefined
          const poetryDevDeps = (poetry?.['dev-dependencies'] ?? poetryGroup?.['dev']?.['dependencies']) as Record<string, unknown> | undefined
          if (poetryDevDeps) {
            for (const [name, ver] of Object.entries(poetryDevDeps)) {
              dev[name.toLowerCase()] = typeof ver === 'string' ? ver : '*'
            }
          }
        }

        // Linting / formatting tools from [tool.*]
        if (tool) {
          if ('ruff'   in tool) { lintingTools.push('ruff');   lintingConfigs.push('pyproject.toml') }
          if ('mypy'   in tool) { lintingTools.push('mypy');   lintingConfigs.push('pyproject.toml') }
          if ('black'  in tool) { lintingTools.push('black');  lintingConfigs.push('pyproject.toml') }
          if ('pylint' in tool) { lintingTools.push('pylint') }
          if ('isort'  in tool) { lintingTools.push('isort') }
          if ('flake8' in tool) { lintingTools.push('flake8') }

          // Pytest config
          const pytestConfig = (tool['pytest'] as Record<string, unknown> | undefined)?.['ini_options'] as Record<string, unknown> | undefined
          if (pytestConfig) {
            const testPaths = pytestConfig['testpaths'] as string[] | undefined
            testing = {
              framework: 'pytest',
              pattern: testPaths?.length ? `${testPaths[0]}/**/*.py` : 'tests/**/*.py',
              confidence: 'high',
            }
          }
        }
      } catch {
        // Malformed TOML — continue with what we have
      }
    }

    // ── requirements.txt ────────────────────────────────────────────────────
    const reqPath = ctx.configFiles.get('requirements.txt')
    if (reqPath) {
      evidence.push('requirements.txt found')
      try {
        for (const line of readFileSync(reqPath, 'utf-8').split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue
          const [name, ver] = splitDep(trimmed)
          if (name) runtime[name] = ver
        }
      } catch { /* skip */ }
    }

    // ── .python-version ──────────────────────────────────────────────────────
    const pvPath = ctx.configFiles.get('.python-version')
    if (pvPath && !pythonVersion) {
      try {
        pythonVersion = readFileSync(pvPath, 'utf-8').trim() || undefined
        if (pythonVersion) evidence.push(`.python-version: ${pythonVersion}`)
      } catch { /* skip */ }
    }

    if (pyFiles > 0) evidence.push(`${pyFiles} .py files`)

    // ── Framework detection ──────────────────────────────────────────────────
    const allDepNames = new Set([...Object.keys(runtime), ...Object.keys(dev)])
    for (const [depName, signal] of FRAMEWORK_MAP) {
      if (allDepNames.has(depName)) {
        frameworks.push({
          name: signal.name,
          confidence: 'high',
          category: signal.category,
          evidence: [`${depName} in dependencies`],
        })
      }
    }

    // ── Testing detection ────────────────────────────────────────────────────
    if (!testing) {
      if (allDepNames.has('pytest') || dev['pytest']) {
        testing = { framework: 'pytest', pattern: 'tests/**/*.py', confidence: 'high' }
      } else if (ctx.fileTree.some((f) => f.match(/test_.*\.py$/))) {
        testing = { framework: 'unittest', pattern: 'test_*.py', confidence: 'medium' }
      }
    }

    // ── Ruff / mypy from standalone config files ──────────────────────────────
    if (ctx.configFiles.has('ruff.toml') || ctx.configFiles.has('.ruff.toml')) {
      if (!lintingTools.includes('ruff')) lintingTools.push('ruff')
      lintingConfigs.push('ruff.toml')
    }
    if (ctx.configFiles.has('mypy.ini') || ctx.configFiles.has('.mypy.ini')) {
      if (!lintingTools.includes('mypy')) lintingTools.push('mypy')
      lintingConfigs.push('mypy.ini')
    }
    if (ctx.configFiles.has('pytest.ini')) {
      if (!testing || testing.confidence === 'medium') {
        testing = { framework: 'pytest', pattern: 'tests/**/*.py', confidence: 'high' }
      }
    }

    // ── Build result ─────────────────────────────────────────────────────────
    const hasPython = pyFiles > 0 || pyprojectPath != null || ctx.configFiles.has('setup.py')
    const linting: LintingSignal | undefined =
      lintingTools.length > 0
        ? { tools: lintingTools, configFiles: lintingConfigs, styleRules: {} }
        : undefined

    const deps: DependencyMap[] =
      Object.keys(runtime).length > 0 || Object.keys(dev).length > 0
        ? [{ runtime, dev, peer: {}, sourceFile: pyprojectPath ? 'pyproject.toml' : 'requirements.txt' }]
        : []

    return {
      analyzerId: this.id,
      languages: hasPython
        ? [{ name: 'Python', version: pythonVersion, confidence: pyprojectPath ? 'high' : 'medium', percentage, primary: false, evidence }]
        : [],
      frameworks,
      dependencies: deps,
      linting,
      testing,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function splitDep(dep: string): [string, string] {
  const match = dep.match(/^([a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?)\s*([>=<!~^,].+)?$/)
  if (!match?.[1]) return ['', '*']
  return [match[1].toLowerCase(), match[3]?.trim() ?? '*']
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

function countSourceFiles(ctx: AnalyzerContext): number {
  const SOURCE_EXTS = ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java', '.rb', '.cs']
  return ctx.fileTree.filter((f) => SOURCE_EXTS.some((ext) => f.endsWith(ext))).length
}

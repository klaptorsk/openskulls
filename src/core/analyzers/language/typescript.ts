/**
 * TypeScript analyzer.
 *
 * Triggers on: tsconfig.json (or typescript in package.json deps)
 * Detects: TypeScript language signal and version.
 *
 * Intentionally does NOT re-detect frameworks or linting — those
 * are covered by JavaScriptAnalyzer reading package.json.
 */

import { readFileSync } from 'node:fs'
import { BaseAnalyzer, countFilesWithExtension } from '../base.js'
import type { AnalyzerContext, AnalyzerResult } from '../base.js'

interface TsConfig {
  compilerOptions?: {
    strict?: boolean
    target?: string
    module?: string
    noUncheckedIndexedAccess?: boolean
    exactOptionalPropertyTypes?: boolean
  }
  extends?: string
}

interface PackageJson {
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

export class TypeScriptAnalyzer extends BaseAnalyzer {
  readonly id = 'typescript'
  readonly triggerFiles = ['tsconfig.json']
  readonly priority = 12 // After JavaScriptAnalyzer (8)

  canRun(ctx: AnalyzerContext): boolean {
    // Also trigger if typescript is in package.json deps, even without tsconfig.json
    if (ctx.configFiles.has('tsconfig.json')) return true
    const pkgPath = ctx.configFiles.get('package.json')
    if (!pkgPath) return false
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      return 'typescript' in allDeps
    } catch {
      return false
    }
  }

  analyze(ctx: AnalyzerContext): AnalyzerResult {
    const tsFiles = countFilesWithExtension(ctx, '.ts') + countFilesWithExtension(ctx, '.tsx')
    const jsFiles = countFilesWithExtension(ctx, '.js') + countFilesWithExtension(ctx, '.jsx')
    const allSourceFiles = tsFiles + jsFiles

    if (tsFiles === 0 && !ctx.configFiles.has('tsconfig.json')) {
      return { analyzerId: this.id }
    }

    const evidence: string[] = []
    let tsVersion: string | undefined
    let isStrict = false

    // Read TypeScript version from package.json
    const pkgPath = ctx.configFiles.get('package.json')
    if (pkgPath) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
        const rawVersion = allDeps['typescript']
        if (rawVersion) {
          tsVersion = rawVersion.replace(/[^0-9.]/g, '').split('.').slice(0, 2).join('.') || undefined
          evidence.push(`typescript@${rawVersion} in package.json`)
        }
      } catch { /* skip */ }
    }

    // Read tsconfig.json for strict mode
    const tsconfigPath = ctx.configFiles.get('tsconfig.json')
    if (tsconfigPath) {
      evidence.push('tsconfig.json found')
      try {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as TsConfig
        isStrict = tsconfig.compilerOptions?.strict ?? false
        if (isStrict) evidence.push('strict mode enabled')
      } catch { /* skip */ }
    }

    if (tsFiles > 0) evidence.push(`${tsFiles} .ts/.tsx files`)

    const percentage = allSourceFiles > 0
      ? Math.round((tsFiles / allSourceFiles) * 1000) / 10
      : 100 // only tsconfig.json, no source files yet

    return {
      analyzerId: this.id,
      languages: [{
        name: 'TypeScript',
        version: tsVersion,
        confidence: tsconfigPath != null ? 'high' : 'medium',
        percentage,
        primary: false, // computed by collector
        evidence,
      }],
      conventions: isStrict
        ? [{ name: 'typescript_strict', value: 'true', confidence: 'high', evidence: ['tsconfig strict: true'] }]
        : [],
    }
  }
}

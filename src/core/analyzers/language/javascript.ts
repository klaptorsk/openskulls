/**
 * JavaScript analyzer — reads package.json.
 *
 * Responsible for:
 *  - JavaScript language signal (.js/.jsx files)
 *  - All deps, frameworks, testing, linting from package.json
 *    (TypeScript projects also trigger this via package.json)
 *
 * TypeScriptAnalyzer handles the TypeScript language signal separately.
 */

import { readFileSync } from 'node:fs'
import { BaseAnalyzer, countFilesWithExtension } from '../base.js'
import type { AnalyzerContext, AnalyzerResult } from '../base.js'
import type { FrameworkSignal, LintingSignal, TestingSignal } from '../../fingerprint/types.js'

// ─── Framework detection maps ─────────────────────────────────────────────────

const FRAMEWORK_MAP = new Map<string, { name: string; category: string }>([
  ['next',          { name: 'Next.js',    category: 'fullstack' }],
  ['nuxt',          { name: 'Nuxt',       category: 'fullstack' }],
  ['@nuxtjs/nuxt',  { name: 'Nuxt',       category: 'fullstack' }],
  ['remix',         { name: 'Remix',      category: 'fullstack' }],
  ['@remix-run/node', { name: 'Remix',    category: 'fullstack' }],
  ['react',         { name: 'React',      category: 'frontend'  }],
  ['vue',           { name: 'Vue',        category: 'frontend'  }],
  ['svelte',        { name: 'Svelte',     category: 'frontend'  }],
  ['solid-js',      { name: 'SolidJS',    category: 'frontend'  }],
  ['@angular/core', { name: 'Angular',    category: 'frontend'  }],
  ['express',       { name: 'Express',    category: 'backend'   }],
  ['fastify',       { name: 'Fastify',    category: 'backend'   }],
  ['koa',           { name: 'Koa',        category: 'backend'   }],
  ['hono',          { name: 'Hono',       category: 'backend'   }],
  ['@nestjs/core',  { name: 'NestJS',     category: 'backend'   }],
  ['@trpc/server',  { name: 'tRPC',       category: 'backend'   }],
  ['graphql',       { name: 'GraphQL',    category: 'backend'   }],
  ['prisma',        { name: 'Prisma',     category: 'orm'       }],
  ['@prisma/client', { name: 'Prisma',    category: 'orm'       }],
  ['drizzle-orm',   { name: 'Drizzle',    category: 'orm'       }],
  ['mongoose',      { name: 'Mongoose',   category: 'orm'       }],
  ['typeorm',       { name: 'TypeORM',    category: 'orm'       }],
  ['zod',           { name: 'Zod',        category: 'validation'}],
  ['@tanstack/react-query', { name: 'TanStack Query', category: 'frontend' }],
  ['tailwindcss',   { name: 'Tailwind CSS', category: 'frontend' }],
  ['electron',      { name: 'Electron',   category: 'desktop'   }],
])

// ─── Analyzer ────────────────────────────────────────────────────────────────

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
  engines?: Record<string, string>
  packageManager?: string
}

export class JavaScriptAnalyzer extends BaseAnalyzer {
  readonly id = 'javascript'
  readonly triggerFiles = ['package.json']
  readonly priority = 8

  analyze(ctx: AnalyzerContext): AnalyzerResult {
    const pkgPath = ctx.configFiles.get('package.json')
    if (!pkgPath) return { analyzerId: this.id }

    let pkg: PackageJson
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch {
      return { analyzerId: this.id }
    }

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const jsFiles = countFilesWithExtension(ctx, '.js') + countFilesWithExtension(ctx, '.jsx')
    const tsFiles = countFilesWithExtension(ctx, '.ts') + countFilesWithExtension(ctx, '.tsx')
    const allSourceFiles = jsFiles + tsFiles

    // JS language signal — only emit if there are actual .js files
    const jsPercentage = allSourceFiles > 0 ? Math.round((jsFiles / allSourceFiles) * 1000) / 10 : 0

    // ── Framework detection ──────────────────────────────────────────────────
    const frameworks: FrameworkSignal[] = []
    const seenFrameworks = new Set<string>()
    for (const [dep, signal] of FRAMEWORK_MAP) {
      if (dep in allDeps && !seenFrameworks.has(signal.name)) {
        seenFrameworks.add(signal.name)
        frameworks.push({
          name: signal.name,
          version: allDeps[dep]?.replace(/[^0-9.]/g, '').split('.').slice(0, 2).join('.') || undefined,
          confidence: 'high',
          category: signal.category,
          evidence: [`${dep} in package.json`],
        })
      }
    }

    // ── Testing detection ────────────────────────────────────────────────────
    let testing: TestingSignal | undefined

    if ('vitest' in allDeps) {
      testing = { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' }
    } else if ('jest' in allDeps || '@types/jest' in allDeps) {
      const pattern = 'typescript' in allDeps ? '**/*.test.ts' : '**/*.test.js'
      testing = { framework: 'jest', pattern, confidence: 'high' }
    } else if ('mocha' in allDeps) {
      testing = { framework: 'mocha', pattern: 'test/**/*.js', confidence: 'high' }
    } else if ('@playwright/test' in allDeps) {
      testing = { framework: 'Playwright', pattern: '**/*.spec.ts', confidence: 'high' }
    } else if ('cypress' in allDeps) {
      testing = { framework: 'Cypress', pattern: 'cypress/e2e/**/*.cy.ts', confidence: 'high' }
    }

    // ── Linting detection ────────────────────────────────────────────────────
    const lintingTools: string[] = []
    const lintingConfigs: string[] = []

    if ('eslint' in allDeps) {
      lintingTools.push('eslint')
      for (const name of ['.eslintrc.json', '.eslintrc.js', 'eslint.config.js', 'eslint.config.mjs']) {
        if (ctx.configFiles.has(name)) { lintingConfigs.push(name); break }
      }
    }
    if ('prettier' in allDeps) {
      lintingTools.push('prettier')
      for (const name of ['.prettierrc', '.prettierrc.json', 'prettier.config.js']) {
        if (ctx.configFiles.has(name)) { lintingConfigs.push(name); break }
      }
    }
    if ('biome' in allDeps) lintingTools.push('biome')
    if ('xo' in allDeps) lintingTools.push('xo')

    const linting: LintingSignal | undefined =
      lintingTools.length > 0
        ? { tools: lintingTools, configFiles: lintingConfigs, styleRules: {} }
        : undefined

    // ── Conventions: detect package manager ─────────────────────────────────
    let pkgManager = 'npm'
    if (ctx.configFiles.has('yarn.lock')) pkgManager = 'yarn'
    else if (ctx.configFiles.has('pnpm-lock.yaml')) pkgManager = 'pnpm'
    else if (ctx.configFiles.has('bun.lockb')) pkgManager = 'bun'
    else if (pkg.packageManager?.startsWith('pnpm')) pkgManager = 'pnpm'
    else if (pkg.packageManager?.startsWith('yarn')) pkgManager = 'yarn'
    else if (pkg.packageManager?.startsWith('bun')) pkgManager = 'bun'

    return {
      analyzerId: this.id,
      languages: jsFiles > 0
        ? [{ name: 'JavaScript', confidence: 'high', percentage: jsPercentage, primary: false, evidence: [`${jsFiles} .js/.jsx files`] }]
        : [],
      frameworks,
      dependencies: [{
        runtime: pkg.dependencies ?? {},
        dev: pkg.devDependencies ?? {},
        peer: pkg.peerDependencies ?? {},
        sourceFile: 'package.json',
      }],
      testing,
      linting,
      conventions: [{ name: 'package_manager', value: pkgManager, confidence: 'high', evidence: [`${pkgManager} lock file detected`] }],
    }
  }
}

/**
 * Go language analyzer.
 *
 * Triggers on: go.mod
 * Detects: language signal, version, module name, frameworks, dependencies
 */

import { readFileSync } from 'node:fs'
import { BaseAnalyzer, countFilesWithExtension } from '../base.js'
import type { AnalyzerContext, AnalyzerResult } from '../base.js'
import type { DependencyMap, FrameworkSignal } from '../../fingerprint/types.js'

// ─── Framework map ────────────────────────────────────────────────────────────
// Keyed by Go module path prefix

const FRAMEWORK_MAP = new Map<string, { name: string; category: string }>([
  ['github.com/gin-gonic/gin',                 { name: 'Gin',          category: 'backend' }],
  ['github.com/labstack/echo',                  { name: 'Echo',         category: 'backend' }],
  ['github.com/gofiber/fiber',                  { name: 'Fiber',        category: 'backend' }],
  ['github.com/gorilla/mux',                    { name: 'Gorilla Mux',  category: 'backend' }],
  ['github.com/go-chi/chi',                     { name: 'Chi',          category: 'backend' }],
  ['github.com/gorillawebsocket/websocket',     { name: 'Gorilla WS',   category: 'backend' }],
  ['google.golang.org/grpc',                    { name: 'gRPC',         category: 'backend' }],
  ['github.com/grpc-ecosystem/grpc-gateway',    { name: 'gRPC-Gateway', category: 'backend' }],
  ['gorm.io/gorm',                              { name: 'GORM',         category: 'orm'     }],
  ['github.com/jmoiron/sqlx',                   { name: 'sqlx',         category: 'orm'     }],
  ['github.com/uptrace/bun',                    { name: 'Bun',          category: 'orm'     }],
  ['entgo.io/ent',                              { name: 'Ent',          category: 'orm'     }],
  ['github.com/spf13/cobra',                    { name: 'Cobra',        category: 'cli'     }],
  ['github.com/urfave/cli',                     { name: 'urfave/cli',   category: 'cli'     }],
  ['go.uber.org/zap',                           { name: 'Zap',          category: 'logging' }],
  ['github.com/rs/zerolog',                     { name: 'Zerolog',      category: 'logging' }],
  ['github.com/hashicorp/terraform-plugin-sdk', { name: 'Terraform SDK',category: 'infra'   }],
])

// ─── Analyzer ────────────────────────────────────────────────────────────────

export class GoAnalyzer extends BaseAnalyzer {
  readonly id = 'go'
  readonly triggerFiles = ['go.mod']
  readonly priority = 5

  analyze(ctx: AnalyzerContext): AnalyzerResult {
    const goModPath = ctx.configFiles.get('go.mod')
    if (!goModPath) return { analyzerId: this.id }

    let content: string
    try {
      content = readFileSync(goModPath, 'utf-8')
    } catch {
      return { analyzerId: this.id }
    }

    const evidence: string[] = ['go.mod found']

    // ── Module name ──────────────────────────────────────────────────────────
    const moduleName = content.match(/^module\s+(\S+)/m)?.[1]
    if (moduleName) evidence.push(`module: ${moduleName}`)

    // ── Go version ───────────────────────────────────────────────────────────
    const goVersion = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m)?.[1]
    if (goVersion) evidence.push(`go ${goVersion}`)

    // ── Dependencies from require blocks ─────────────────────────────────────
    const runtime: Record<string, string> = {}
    const dev: Record<string, string> = {}

    // Multi-line require block: require (\n  ...\n)
    const multilineRequire = content.matchAll(/require\s*\(\s*([\s\S]*?)\s*\)/gm)
    for (const block of multilineRequire) {
      const blockContent = block[1] ?? ''
      for (const line of blockContent.split('\n')) {
        parseRequireLine(line, runtime, dev)
      }
    }

    // Single-line require: require github.com/pkg v1.0.0
    const singleRequire = content.matchAll(/^require\s+(\S+)\s+(\S+)/gm)
    for (const match of singleRequire) {
      const modPath = match[1]
      const version = match[2]
      if (modPath && version) {
        const key = modPath.toLowerCase()
        if (version.includes('-') || key.includes('test')) {
          dev[key] = version
        } else {
          runtime[key] = version
        }
      }
    }

    const goFiles = countFilesWithExtension(ctx, '.go')
    if (goFiles > 0) evidence.push(`${goFiles} .go files`)

    // ── Source file percentage ────────────────────────────────────────────────
    const allSource = ctx.fileTree.filter((f) =>
      ['.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.java'].some((ext) => f.endsWith(ext)),
    ).length
    const percentage = allSource > 0 ? Math.round((goFiles / allSource) * 1000) / 10 : 100

    // ── Framework detection ───────────────────────────────────────────────────
    const frameworks: FrameworkSignal[] = []
    const allModPaths = new Set([...Object.keys(runtime), ...Object.keys(dev)])
    for (const [modPath, signal] of FRAMEWORK_MAP) {
      if (allModPaths.has(modPath.toLowerCase())) {
        frameworks.push({
          name: signal.name,
          version: runtime[modPath.toLowerCase()],
          confidence: 'high',
          category: signal.category,
          evidence: [`${modPath} in go.mod`],
        })
      }
    }

    // ── Architecture patches ──────────────────────────────────────────────────
    const architecturePatch = moduleName
      ? { style: 'monolith' as const }
      : undefined

    const deps: DependencyMap[] =
      Object.keys(runtime).length > 0 || Object.keys(dev).length > 0
        ? [{ runtime, dev, peer: {}, sourceFile: 'go.mod' }]
        : []

    return {
      analyzerId: this.id,
      languages: [{
        name: 'Go',
        version: goVersion,
        confidence: 'high',
        percentage,
        primary: false,
        evidence,
      }],
      frameworks,
      dependencies: deps,
      architecturePatch,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseRequireLine(
  line: string,
  runtime: Record<string, string>,
  dev: Record<string, string>,
): void {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('//')) return

  // Strip inline comments
  const withoutComment = trimmed.split('//')[0]?.trim() ?? trimmed
  const parts = withoutComment.split(/\s+/)
  const modPath = parts[0]
  const version = parts[1]

  if (!modPath || !version || version === '=>') return

  const key = modPath.toLowerCase()
  // Heuristic: indirect dependencies or test packages go to dev
  if (line.includes('// indirect') || key.includes('test')) {
    dev[key] = version
  } else {
    runtime[key] = version
  }
}

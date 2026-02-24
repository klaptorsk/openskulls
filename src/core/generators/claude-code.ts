/**
 * Claude Code generator.
 *
 * Produces:
 *   CLAUDE.md               — project context file (merge_sections strategy)
 *   .claude/commands/*.md   — one file per skill from installed packages
 *   .claude/settings.json   — Claude Code settings
 *
 * Stateless and pure: same GeneratorInput → same GeneratedFile[].
 * Reads the CLAUDE.md template once at module load; no I/O in generate().
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import { skillsForTool } from '../packages/types.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'

// ─── Template loading ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../../templates/claude-code/CLAUDE.md.hbs')

// Read template once at module load — not inside generate() — so the function is pure.
const TEMPLATE_SOURCE = readFileSync(TEMPLATE_PATH, 'utf-8')

// ─── Handlebars setup ─────────────────────────────────────────────────────────

const hbs = Handlebars.create()

hbs.registerHelper('capitalize', (s: unknown) => {
  if (typeof s !== 'string' || !s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
})

hbs.registerHelper('uppercase', (s: unknown) => {
  if (typeof s !== 'string') return ''
  return s.toUpperCase()
})

hbs.registerHelper('titlecase', (s: unknown) => {
  if (typeof s !== 'string' || !s) return ''
  return s
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
})

hbs.registerHelper('join', (arr: unknown, sep: unknown) => {
  if (!Array.isArray(arr)) return ''
  return arr.join(typeof sep === 'string' ? sep : ', ')
})

hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b)

const COMPILED_TEMPLATE = hbs.compile(TEMPLATE_SOURCE)

// ─── Template context ─────────────────────────────────────────────────────────

interface TemplateContext {
  repoName: string
  primaryLanguage: string | undefined
  primaryFramework: string | undefined
  architectureStyle: string
  apiStyle: string | undefined
  database: string | undefined
  entryPoints: string[]
  moduleStructure: string[]
  languages: GeneratorInput['fingerprint']['languages']
  frameworks: GeneratorInput['fingerprint']['frameworks']
  conventions: GeneratorInput['fingerprint']['conventions']
  lintingTools: string[]
  testing: GeneratorInput['fingerprint']['testing'] | undefined
  cicd: GeneratorInput['fingerprint']['cicd'] | undefined
  packageSections: Array<{ id: string; content: string }>
  isConventionalCommits: boolean
}

// ─── Generator ────────────────────────────────────────────────────────────────

export class ClaudeCodeGenerator extends BaseGenerator {
  readonly toolId = 'claude_code'
  readonly toolName = 'Claude Code'
  override readonly detectionFiles = ['CLAUDE.md', '.claude/settings.json'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const { fingerprint, installedPackages } = input
    const files: GeneratedFile[] = []

    // ── CLAUDE.md ───────────────────────────────────────────────────────────

    // Collect context sections from all installed packages
    const packageSections = installedPackages.flatMap((pkg) =>
      Object.entries(pkg.contextSections).map(([id, content]) => ({ id, content })),
    )

    const isConventionalCommits =
      fingerprint.git?.commitStyle === 'conventional_commits' ||
      fingerprint.conventions.some((c) => c.name === 'conventional_commits')

    const ctx: TemplateContext = {
      repoName: fingerprint.repoName,
      primaryLanguage: fingerprint.primaryLanguage,
      primaryFramework: fingerprint.primaryFramework,
      architectureStyle: fingerprint.architecture.style,
      apiStyle: fingerprint.architecture.apiStyle,
      database: fingerprint.architecture.database,
      entryPoints: fingerprint.architecture.entryPoints,
      moduleStructure: fingerprint.architecture.moduleStructure,
      languages: fingerprint.languages,
      frameworks: fingerprint.frameworks,
      // Only include conventions that have a detected value (skip structural markers)
      conventions: fingerprint.conventions.filter((c) => c.value !== undefined),
      lintingTools: fingerprint.linting?.tools ?? [],
      testing: fingerprint.testing,
      cicd: fingerprint.cicd,
      packageSections,
      isConventionalCommits,
    }

    files.push(repoFile('CLAUDE.md', COMPILED_TEMPLATE(ctx), 'merge_sections'))

    // ── .claude/commands/<id>.md ────────────────────────────────────────────

    for (const pkg of installedPackages) {
      for (const skill of skillsForTool(pkg, this.toolId)) {
        files.push(repoFile(`.claude/commands/${skill.id}.md`, skill.content))
      }
    }

    // ── .claude/settings.json ───────────────────────────────────────────────

    const settings = {
      version: 1,
    }
    files.push(repoFile('.claude/settings.json', JSON.stringify(settings, null, 2)))

    return files
  }
}

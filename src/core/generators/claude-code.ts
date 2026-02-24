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
import { type RepoFingerprint } from '../fingerprint/types.js'
import { type AISkill } from '../fingerprint/skills-builder.js'
import { type WorkflowConfig } from '../config/types.js'
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

// ─── Architecture style labels ────────────────────────────────────────────────

const STYLE_LABELS: Record<string, string> = {
  cli: 'CLI tool',
  library: 'Library',
  monolith: 'Monolith',
  monorepo: 'Monorepo',
  microservices: 'Microservices',
}

// ─── Template context ─────────────────────────────────────────────────────────

interface TemplateContext {
  repoName: string
  description: string | undefined
  primaryLanguage: string | undefined
  primaryFramework: string | undefined
  architectureStyle: string
  architectureStyleLabel: string | undefined
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
  workflowRules: string
}

// ─── Workflow rules builder ───────────────────────────────────────────────────

function buildWorkflowRulesContent(config: WorkflowConfig): string {
  const lines: string[] = []

  if (config.autoDocs === 'always') {
    lines.push('- **Documentation**: After adding or updating a feature, always update README.md and any relevant documentation files before marking the task complete.')
  } else if (config.autoDocs === 'ask') {
    lines.push('- **Documentation**: After adding or updating a feature, ask the user whether documentation (README.md, docs/) should be updated before finishing.')
  }

  if (config.autoCommit === 'always') {
    lines.push('- **Commits**: After completing a feature or fix, stage the relevant changed files and create a git commit with an appropriate message.')
  } else if (config.autoCommit === 'ask') {
    lines.push('- **Commits**: After completing a task, ask the user if they want to commit the changes.')
  }

  return lines.join('\n')
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
      description: fingerprint.description,
      primaryLanguage: fingerprint.primaryLanguage,
      primaryFramework: fingerprint.primaryFramework,
      architectureStyle: fingerprint.architecture.style,
      architectureStyleLabel: STYLE_LABELS[fingerprint.architecture.style],
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
      workflowRules: input.workflowConfig ? buildWorkflowRulesContent(input.workflowConfig) : '',
    }

    files.push(repoFile('CLAUDE.md', COMPILED_TEMPLATE(ctx), 'merge_sections'))

    // ── .claude/commands/<id>.md ────────────────────────────────────────────

    // Built-in skills first (installed packages can override by providing a skill with the same id)
    for (const f of this.generateBuiltinSkills(fingerprint, isConventionalCommits)) {
      files.push(f)
    }

    for (const pkg of installedPackages) {
      for (const skill of skillsForTool(pkg, this.toolId)) {
        files.push(repoFile(`.claude/commands/${skill.id}.md`, skill.content))
      }
    }

    // ── AI-generated skills ──────────────────────────────────────────────────

    if (input.aiSkills && input.aiSkills.length > 0) {
      // .claude/skills.md — index grouped by category (merge_sections)
      files.push(repoFile('.claude/skills.md', buildSkillsOverview(input.aiSkills), 'merge_sections'))

      // Individual SKILL.md files — one directory per skill
      for (const skill of input.aiSkills) {
        files.push(repoFile(`.claude/skills/${skill.id}/SKILL.md`, buildSkillFile(skill)))
      }
    }

    // ── .claude/settings.json ───────────────────────────────────────────────

    const settings = {
      version: 1,
    }
    files.push(repoFile('.claude/settings.json', JSON.stringify(settings, null, 2)))

    return files
  }

  private generateBuiltinSkills(fingerprint: RepoFingerprint, isConventionalCommits: boolean): GeneratedFile[] {
    const files: GeneratedFile[] = []

    if (fingerprint.testing) {
      const pkgMgr = fingerprint.conventions.find((c) => c.name === 'package_manager')?.value ?? 'npm'
      const runCmd =
        pkgMgr === 'bun' ? 'bun test' :
        pkgMgr === 'pnpm' ? 'pnpm test' :
        pkgMgr === 'yarn' ? 'yarn test' :
        'npm test'
      const { framework, pattern } = fingerprint.testing
      const patternLine = pattern ? `\n3. Tests match the pattern \`${pattern}\`.` : ''
      const content = [
        `---`,
        `description: Run the full test suite using ${framework}.`,
        `---`,
        ``,
        `Run the full test suite.`,
        ``,
        `1. Execute \`${runCmd}\`.`,
        `2. Read any failing test output carefully before attempting a fix.`,
        patternLine.trimStart(),
      ].filter((l) => l !== '').join('\n')
      files.push(repoFile('.claude/commands/run-tests.md', content))
    }

    if (isConventionalCommits) {
      const content = [
        `---`,
        `description: Create a Conventional Commits formatted git commit for staged changes.`,
        `---`,
        ``,
        `Create a git commit using Conventional Commits format.`,
        ``,
        `1. Run \`git diff --staged\` to review what is staged.`,
        `2. Choose the correct type: \`feat\` (new feature), \`fix\` (bug fix), \`chore\` (maintenance), \`docs\` (documentation), \`refactor\` (no feature/fix), \`test\` (tests).`,
        `3. Write the subject line as \`<type>(<scope>): <description>\` — lowercase, no period, under 72 characters.`,
        `4. Add a body if the change needs context beyond the subject line.`,
        `5. Run \`git commit -m "<message>"\` with the composed message.`,
      ].join('\n')
      files.push(repoFile('.claude/commands/commit.md', content))
    }

    return files
  }
}

// ─── AI skills helpers ────────────────────────────────────────────────────────

/**
 * Render `.claude/skills.md` — index grouped by category, sorted alphabetically.
 */
function buildSkillsOverview(skills: readonly AISkill[]): string {
  // Group by category
  const groups = new Map<string, AISkill[]>()
  for (const skill of skills) {
    const group = groups.get(skill.category) ?? []
    group.push(skill)
    groups.set(skill.category, group)
  }

  const sortedCategories = [...groups.keys()].sort()

  const lines: string[] = [
    '<!-- openskulls:section:skills -->',
    '# Project Skills',
    '',
    '> Auto-generated — run `openskulls sync` to update.',
    '> Each skill lives at `.claude/skills/<id>/SKILL.md` and is available as a `/<id>` slash command.',
  ]

  for (const category of sortedCategories) {
    const categorySkills = groups.get(category)!.slice().sort((a, b) => a.id.localeCompare(b.id))
    const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)

    lines.push('', `## ${categoryTitle}`)

    for (const skill of categorySkills) {
      lines.push('', `### ${skill.title}`, `\`/${skill.id}\` — ${skill.description}`)
    }
  }

  lines.push('', '<!-- /openskulls:section:skills -->')
  return lines.join('\n')
}

/**
 * Render `.claude/skills/<id>/SKILL.md`.
 *
 * Follows the Claude Code SKILL.md convention:
 *  - YAML frontmatter: name (slash command id) + multi-line trigger description
 *  - Body: rich markdown reference document generated by AI
 */
function buildSkillFile(skill: AISkill): string {
  const lines = [
    '---',
    `name: ${skill.id}`,
    'description: >',
    // Indent the description block under the YAML folded scalar
    ...skill.description.split('. ').map((s) => `  ${s.trim()}${s.endsWith('.') ? '' : '.'}`),
    '---',
    '',
    skill.content,
  ]
  return lines.join('\n')
}

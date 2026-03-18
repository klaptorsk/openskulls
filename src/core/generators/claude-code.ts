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

import Handlebars from 'handlebars'
import { skillsForTool } from '../packages/types.js'
import { type RepoFingerprint } from '../fingerprint/types.js'
import { type AISkill } from '../fingerprint/skills-builder.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'
import { STYLE_LABELS, isConventionalCommits, buildWorkflowRuleLines } from './shared.js'
import { CLAUDE_MD_TEMPLATE } from '../../generated/templates.js'

// ─── Template loading ─────────────────────────────────────────────────────────

// Template is inlined at build time — no runtime filesystem dependency.
const TEMPLATE_SOURCE = CLAUDE_MD_TEMPLATE

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
  userAnswerEntries: Array<{ key: string; value: string }>
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

    const conventionalCommits = isConventionalCommits(fingerprint)

    const userAnswerEntries = input.userAnswers
      ? Object.entries(input.userAnswers).map(([key, value]) => ({ key, value }))
      : []

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
      isConventionalCommits: conventionalCommits,
      workflowRules: input.workflowConfig ? buildWorkflowRuleLines(input.workflowConfig).join('\n') : '',
      userAnswerEntries,
    }

    files.push(repoFile('CLAUDE.md', COMPILED_TEMPLATE(ctx), 'merge_sections'))

    // ── .claude/commands/<id>.md ────────────────────────────────────────────

    // Built-in skills first (installed packages can override by providing a skill with the same id)
    for (const f of this.generateBuiltinSkills(fingerprint, conventionalCommits)) {
      files.push(f)
    }

    // Pack skills as SKILL.md (git-native packs use skills/ not commands/)
    for (const pkg of installedPackages) {
      for (const skill of skillsForTool(pkg, this.toolId)) {
        const packSkillContent = buildSkillFile({
          id: `${pkg.name}-${skill.id}`,
          title: skill.name,
          description: skill.description,
          content: skill.content,
          category: 'workflow',
        })
        files.push(repoFile(`.claude/skills/${pkg.name}-${skill.id}/SKILL.md`, packSkillContent))
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

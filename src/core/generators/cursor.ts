/**
 * Cursor generator.
 *
 * Produces:
 *   .cursor/rules/project.mdc  — project context rule (merge_sections strategy)
 *
 * Uses the new Cursor rules format (.cursor/rules/*.mdc) with YAML frontmatter.
 * `alwaysApply: true` ensures the rule is included in every Cursor session.
 *
 * Stateless and pure: same GeneratorInput → same GeneratedFile[].
 */

import type { WorkflowConfig } from '../config/types.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'
import { STYLE_LABELS, isConventionalCommits, buildWorkflowRuleLines } from './shared.js'

// ─── Generator ────────────────────────────────────────────────────────────────

export class CursorGenerator extends BaseGenerator {
  readonly toolId = 'cursor'
  readonly toolName = 'Cursor'
  override readonly detectionFiles = ['.cursor/rules/project.mdc', '.cursorrules'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const content = buildCursorRule(input.fingerprint, input.workflowConfig)
    return [repoFile('.cursor/rules/project.mdc', content, 'merge_sections')]
  }
}

// ─── Content builder ─────────────────────────────────────────────────────────

export function buildCursorRule(
  fp: RepoFingerprint,
  workflow?: WorkflowConfig,
): string {
  const lines: string[] = []

  // ── Frontmatter ─────────────────────────────────────────────────────────────

  lines.push('---')
  lines.push('description: Project context and conventions for AI assistance')
  lines.push('alwaysApply: true')
  lines.push('---')
  lines.push('')

  // ── Overview ────────────────────────────────────────────────────────────────

  lines.push('<!-- openskulls:section:overview -->')
  lines.push('## Project overview')
  lines.push('')
  const overviewParts: string[] = []
  if (fp.architecture.style && fp.architecture.style !== 'unknown') {
    overviewParts.push(STYLE_LABELS[fp.architecture.style] ?? fp.architecture.style)
  }
  if (fp.description) overviewParts.push(fp.description)
  if (fp.primaryLanguage) {
    const lang = `Primary language: **${fp.primaryLanguage}**`
    overviewParts.push(fp.primaryFramework ? `${lang} / **${fp.primaryFramework}**` : lang)
  }
  lines.push(overviewParts.join('. ') + (overviewParts.length ? '.' : ''))
  lines.push('<!-- /openskulls:section:overview -->')
  lines.push('')

  // ── Tech stack ──────────────────────────────────────────────────────────────

  lines.push('<!-- openskulls:section:tech_stack -->')
  lines.push('## Tech stack')
  lines.push('')
  for (const lang of fp.languages) {
    const ver     = lang.version ? ` ${lang.version}` : ''
    const primary = lang.primary ? ' *(primary)*' : ''
    lines.push(`- **${lang.name}**${ver}${primary} — ${lang.percentage.toFixed(0)}% of source files`)
  }
  if (fp.frameworks.length > 0) {
    lines.push('')
    for (const fw of fp.frameworks) {
      const ver = fw.version ? ` ${fw.version}` : ''
      lines.push(`- **${fw.name}**${ver} (${fw.category})`)
    }
  }
  lines.push('<!-- /openskulls:section:tech_stack -->')
  lines.push('')

  // ── Conventions ─────────────────────────────────────────────────────────────

  const detectedConventions = fp.conventions.filter((c) => c.value !== undefined)
  if (detectedConventions.length > 0 || (fp.linting && fp.linting.tools.length > 0)) {
    lines.push('<!-- openskulls:section:conventions -->')
    lines.push('## Conventions')
    lines.push('')
    for (const c of detectedConventions) {
      const name = c.name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase())
      lines.push(`- **${name}**: \`${c.value}\``)
    }
    if (fp.linting && fp.linting.tools.length > 0) {
      lines.push(`- **Linting**: ${fp.linting.tools.join(', ')}`)
    }
    lines.push('<!-- /openskulls:section:conventions -->')
    lines.push('')
  }

  // ── Testing ─────────────────────────────────────────────────────────────────

  if (fp.testing) {
    lines.push('<!-- openskulls:section:testing -->')
    lines.push('## Testing')
    lines.push('')
    const parts = [`**Framework**: ${fp.testing.framework}`]
    if (fp.testing.pattern)      parts.push(`**Pattern**: \`${fp.testing.pattern}\``)
    if (fp.testing.coverageTool) parts.push(`**Coverage**: ${fp.testing.coverageTool}`)
    lines.push(parts.join(' · '))
    lines.push('<!-- /openskulls:section:testing -->')
    lines.push('')
  }

  // ── Workflow rules ───────────────────────────────────────────────────────────

  if (workflow) {
    const workflowLines = buildWorkflowRuleLines(workflow)
    if (workflowLines.length > 0) {
      lines.push('<!-- openskulls:section:workflow_rules -->')
      lines.push('## Workflow rules')
      lines.push('')
      lines.push(...workflowLines)
      lines.push('<!-- /openskulls:section:workflow_rules -->')
      lines.push('')
    }
  }

  // ── Agent guidance ──────────────────────────────────────────────────────────

  lines.push('<!-- openskulls:section:agent_guidance -->')
  lines.push('## Agent guidance')
  lines.push('')
  if (isConventionalCommits(fp)) {
    lines.push('- Use [Conventional Commits](https://www.conventionalcommits.org/) format for all commit messages.')
  }
  lines.push("- Before making changes, read the relevant module's code to understand existing patterns.")
  lines.push('- Run the test suite before proposing a commit.')
  lines.push('- Do not modify files outside the scope of the current task.')
  lines.push('<!-- /openskulls:section:agent_guidance -->')

  return lines.join('\n') + '\n'
}

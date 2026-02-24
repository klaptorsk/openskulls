/**
 * GitHub Copilot generator.
 *
 * Produces:
 *   .github/copilot-instructions.md  — project context (merge_sections strategy)
 *
 * Stateless and pure: same GeneratorInput → same GeneratedFile[].
 */

import type { WorkflowConfig } from '../config/types.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'

// ─── Architecture style labels ────────────────────────────────────────────────

const STYLE_LABELS: Record<string, string> = {
  cli:           'CLI tool',
  library:       'Library',
  monolith:      'Monolith',
  monorepo:      'Monorepo',
  microservices: 'Microservices',
}

// ─── Generator ────────────────────────────────────────────────────────────────

export class CopilotGenerator extends BaseGenerator {
  readonly toolId = 'copilot'
  readonly toolName = 'GitHub Copilot'
  override readonly detectionFiles = ['.github/copilot-instructions.md'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const content = buildCopilotInstructions(input.fingerprint, input.workflowConfig)
    return [repoFile('.github/copilot-instructions.md', content, 'merge_sections')]
  }
}

// ─── Content builder ─────────────────────────────────────────────────────────

export function buildCopilotInstructions(
  fp: RepoFingerprint,
  workflow?: WorkflowConfig,
): string {
  const lines: string[] = []

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
    const workflowLines: string[] = []
    if (workflow.autoDocs === 'always') {
      workflowLines.push('- **Documentation**: After adding or updating a feature, always update README.md and any relevant documentation files before marking the task complete.')
    } else if (workflow.autoDocs === 'ask') {
      workflowLines.push('- **Documentation**: After adding or updating a feature, ask the user whether documentation should be updated before finishing.')
    }
    if (workflow.autoCommit === 'always') {
      workflowLines.push('- **Commits**: After completing a feature or fix, stage the relevant changed files and create a git commit with an appropriate message.')
    } else if (workflow.autoCommit === 'ask') {
      workflowLines.push('- **Commits**: After completing a task, ask the user if they want to commit the changes.')
    }
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
  const isConventionalCommits =
    fp.git?.commitStyle === 'conventional_commits' ||
    fp.conventions.some((c) => c.name === 'conventional_commits')
  if (isConventionalCommits) {
    lines.push('- Use [Conventional Commits](https://www.conventionalcommits.org/) format for all commit messages.')
  }
  lines.push("- Before making changes, read the relevant module's code to understand existing patterns.")
  lines.push('- Run the test suite before proposing a commit.')
  lines.push('- Do not modify files outside the scope of the current task.')
  lines.push('<!-- /openskulls:section:agent_guidance -->')

  return lines.join('\n') + '\n'
}

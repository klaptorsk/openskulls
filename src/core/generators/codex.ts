/**
 * OpenAI Codex generator.
 *
 * Produces:
 *   AGENTS.md  — project context file read by the Codex CLI (merge_sections strategy)
 *
 * Stateless and pure: same GeneratorInput → same GeneratedFile[].
 */

import type { WorkflowConfig } from '../config/types.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import type { AISkill } from '../fingerprint/skills-builder.js'
import type { WorkspaceMapEntry } from '../fingerprint/workspace-types.js'
import { buildGuardrailsSection, type ArchitectGuardrails } from '../fingerprint/guardrails-builder.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'
import { STYLE_LABELS, isConventionalCommits, buildWorkflowRuleLines } from './shared.js'
import { buildWorkspaceMapSection } from './workspace-aggregate.js'

// ─── Generator ────────────────────────────────────────────────────────────────

export class CodexGenerator extends BaseGenerator {
  readonly toolId = 'codex'
  readonly toolName = 'Codex'
  override readonly detectionFiles = ['AGENTS.md'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const content = buildAgentsMd(input.fingerprint, input.workflowConfig, input.aiSkills, input.architectGuardrails, input.workspaceMap ? [...input.workspaceMap] : undefined)
    return [repoFile('AGENTS.md', content, 'merge_sections')]
  }
}

// ─── Content builder ──────────────────────────────────────────────────────────

export function buildAgentsMd(
  fp: RepoFingerprint,
  workflow?: WorkflowConfig,
  aiSkills?: readonly AISkill[],
  guardrails?: ArchitectGuardrails,
  workspaceMap?: WorkspaceMapEntry[],
): string {
  const lines: string[] = []

  lines.push(`# ${fp.repoName}`)
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
  if (overviewParts.length > 0) lines.push(overviewParts.join('. ') + '.')
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

  // ── Architecture ─────────────────────────────────────────────────────────────

  if (fp.architecture.style !== 'unknown' || fp.architecture.entryPoints.length > 0) {
    lines.push('<!-- openskulls:section:architecture -->')
    lines.push('## Architecture')
    lines.push('')
    if (fp.architecture.style !== 'unknown') {
      lines.push(`**Style**: ${STYLE_LABELS[fp.architecture.style] ?? fp.architecture.style}`)
    }
    if (fp.architecture.apiStyle) lines.push(`**API**: ${fp.architecture.apiStyle.toUpperCase()}`)
    if (fp.architecture.database) lines.push(`**Database**: ${fp.architecture.database}`)
    if (fp.architecture.entryPoints.length > 0) {
      lines.push(`**Entry points**: ${fp.architecture.entryPoints.join(', ')}`)
    }
    lines.push('<!-- /openskulls:section:architecture -->')
    lines.push('')
  }

  // ── Workspace map ────────────────────────────────────────────────────────────

  if (workspaceMap && workspaceMap.length > 0) {
    lines.push('<!-- openskulls:section:workspace_map -->')
    lines.push(buildWorkspaceMapSection(workspaceMap))
    lines.push('<!-- /openskulls:section:workspace_map -->')
    lines.push('')
  }

  // ── Conventions ─────────────────────────────────────────────────────────────

  const detectedConventions = fp.conventions.filter((c) => c.value !== undefined)
  if (detectedConventions.length > 0 || (fp.linting && fp.linting.tools.length > 0)) {
    lines.push('<!-- openskulls:section:conventions -->')
    lines.push('## Conventions')
    lines.push('')
    for (const c of detectedConventions) {
      const name = c.name.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
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

  // ── Architect guardrails ─────────────────────────────────────────────────────

  if (guardrails) {
    lines.push('<!-- openskulls:section:architect_guardrails -->')
    lines.push(buildGuardrailsSection(guardrails))
    lines.push('<!-- /openskulls:section:architect_guardrails -->')
    lines.push('')
  }

  // ── Skills ──────────────────────────────────────────────────────────────────

  if (aiSkills && aiSkills.length > 0) {
    lines.push('<!-- openskulls:section:skills -->')
    lines.push('## Available agents')
    lines.push('')
    lines.push('> Run `openskulls sync` to update.')
    lines.push('')
    for (const skill of aiSkills) {
      lines.push(`- **${skill.title}** — ${skill.description}`)
    }
    lines.push('<!-- /openskulls:section:skills -->')
    lines.push('')
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

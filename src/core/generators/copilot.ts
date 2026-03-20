/**
 * GitHub Copilot generator.
 *
 * Produces:
 *   .github/copilot-instructions.md   — project context (merge_sections strategy)
 *   .claude/skills/<id>/SKILL.md      — per-skill reference docs (shared with Claude Code)
 *   .claude/commands/*.md             — built-in workflow scripts
 *
 * Stateless and pure: same GeneratorInput → same GeneratedFile[].
 */

import type { WorkflowConfig } from '../config/types.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import type { WorkspaceMapEntry } from '../fingerprint/workspace-types.js'
import { skillsForTool } from '../packages/types.js'
import { buildGuardrailsSection, type ArchitectGuardrails } from '../fingerprint/guardrails-builder.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'
import { STYLE_LABELS, isConventionalCommits, buildWorkflowRuleLines, buildSkillsOverview, buildSkillFile } from './shared.js'
import { buildWorkspaceMapSection } from './workspace-aggregate.js'

// ─── Generator ────────────────────────────────────────────────────────────────

export class CopilotGenerator extends BaseGenerator {
  readonly toolId = 'copilot'
  readonly toolName = 'GitHub Copilot'
  override readonly detectionFiles = ['.github/copilot-instructions.md'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const { fingerprint, installedPackages } = input
    const files: GeneratedFile[] = []
    const conventionalCommits = isConventionalCommits(fingerprint)

    // ── copilot-instructions.md ───────────────────────────────────────────
    const content = buildCopilotInstructions(fingerprint, input.workflowConfig, input.architectGuardrails, input.workspaceMap ? [...input.workspaceMap] : undefined)
    files.push(repoFile('.github/copilot-instructions.md', content, 'merge_sections'))

    // ── .claude/commands/<id>.md ──────────────────────────────────────────

    for (const f of this.generateBuiltinSkills(fingerprint, conventionalCommits)) {
      files.push(f)
    }

    // ── Pack skills as .claude/skills/<pack>-<id>/SKILL.md ───────────────

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

    // ── AI-generated skills as .claude/skills/<id>/SKILL.md ──────────────

    if (input.aiSkills && input.aiSkills.length > 0) {
      files.push(repoFile('.claude/skills.md', buildSkillsOverview(input.aiSkills, input.foreignSkills ?? []), 'merge_sections'))

      for (const skill of input.aiSkills) {
        files.push(repoFile(`.claude/skills/${skill.id}/SKILL.md`, buildSkillFile(skill)))
      }
    } else if (input.foreignSkills && input.foreignSkills.length > 0) {
      const foreignContent = [
        '<!-- openskulls:section:foreign_skills -->',
        '## Manually Maintained Skills',
        '',
        '> These files exist in `.claude/commands/` but are not managed by openskulls.',
        '',
        ...input.foreignSkills.map((p) => `- \`${p}\``),
        '',
        '<!-- /openskulls:section:foreign_skills -->',
      ].join('\n')
      files.push(repoFile('.claude/skills.md', foreignContent, 'merge_sections'))
    }

    return files
  }

  private generateBuiltinSkills(fingerprint: RepoFingerprint, conventionalCommits: boolean): GeneratedFile[] {
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

    if (conventionalCommits) {
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

// ─── Content builder ─────────────────────────────────────────────────────────

export function buildCopilotInstructions(
  fp: RepoFingerprint,
  workflow?: WorkflowConfig,
  guardrails?: ArchitectGuardrails,
  workspaceMap?: WorkspaceMapEntry[],
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

  // ── Workspace map ────────────────────────────────────────────────────────────

  if (workspaceMap && workspaceMap.length > 0) {
    lines.push('<!-- openskulls:section:workspace_map -->')
    lines.push(buildWorkspaceMapSection(workspaceMap))
    lines.push('<!-- /openskulls:section:workspace_map -->')
    lines.push('')
  }

  // ── Architect guardrails ─────────────────────────────────────────────────────

  if (guardrails) {
    lines.push('<!-- openskulls:section:architect_guardrails -->')
    lines.push(buildGuardrailsSection(guardrails))
    lines.push('<!-- /openskulls:section:architect_guardrails -->')
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


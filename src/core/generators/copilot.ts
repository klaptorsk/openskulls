/**
 * GitHub Copilot generator.
 *
 * Produces:
 *   .github/copilot-instructions.md   — project context (merge_sections strategy)
 *   .github/prompts/*.prompt.md       — reusable prompt files (built-in + AI-generated)
 *
 * Stateless and pure: same GeneratorInput → same GeneratedFile[].
 */

import type { WorkflowConfig } from '../config/types.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import type { AISkill } from '../fingerprint/skills-builder.js'
import type { WorkspaceMapEntry } from '../fingerprint/workspace-types.js'
import { skillsForTool } from '../packages/types.js'
import { buildGuardrailsSection, type ArchitectGuardrails } from '../fingerprint/guardrails-builder.js'
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'
import { STYLE_LABELS, isConventionalCommits, buildWorkflowRuleLines } from './shared.js'
import { buildWorkspaceMapSection } from './workspace-aggregate.js'

// ─── Generator ────────────────────────────────────────────────────────────────

export class CopilotGenerator extends BaseGenerator {
  readonly toolId = 'copilot'
  readonly toolName = 'GitHub Copilot'
  override readonly detectionFiles = ['.github/copilot-instructions.md'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const { fingerprint, installedPackages } = input
    const files: GeneratedFile[] = []

    // ── copilot-instructions.md ───────────────────────────────────────────
    const content = buildCopilotInstructions(fingerprint, input.workflowConfig, input.architectGuardrails, input.workspaceMap ? [...input.workspaceMap] : undefined)
    files.push(repoFile('.github/copilot-instructions.md', content, 'merge_sections'))

    // ── Built-in prompts ──────────────────────────────────────────────────
    for (const f of this.generateBuiltinPrompts(fingerprint)) {
      files.push(f)
    }

    // ── Pack prompts ──────────────────────────────────────────────────────
    for (const pkg of installedPackages) {
      for (const skill of skillsForTool(pkg, this.toolId)) {
        files.push(repoFile(
          `.github/prompts/${pkg.name}-${skill.id}.prompt.md`,
          buildPromptFile(skill.name, skill.description, skill.content),
        ))
      }
    }

    // ── AI-generated prompts ──────────────────────────────────────────────
    if (input.aiSkills && input.aiSkills.length > 0) {
      for (const skill of input.aiSkills) {
        files.push(repoFile(
          `.github/prompts/${skill.id}.prompt.md`,
          buildPromptFile(skill.title, skill.description, skill.content),
        ))
      }
    }

    return files
  }

  private generateBuiltinPrompts(fingerprint: RepoFingerprint): GeneratedFile[] {
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
        `Run the full test suite.`,
        ``,
        `1. Execute \`${runCmd}\`.`,
        `2. Read any failing test output carefully before attempting a fix.`,
        patternLine.trimStart(),
      ].filter((l) => l !== '').join('\n')
      files.push(repoFile(
        '.github/prompts/run-tests.prompt.md',
        buildPromptFile(`Run Tests (${framework})`, `Run the full test suite using ${framework}.`, content),
      ))
    }

    if (isConventionalCommits(fingerprint)) {
      const content = [
        `Create a git commit using Conventional Commits format.`,
        ``,
        `1. Run \`git diff --staged\` to review what is staged.`,
        `2. Choose the correct type: \`feat\` (new feature), \`fix\` (bug fix), \`chore\` (maintenance), \`docs\` (documentation), \`refactor\` (no feature/fix), \`test\` (tests).`,
        `3. Write the subject line as \`<type>(<scope>): <description>\` — lowercase, no period, under 72 characters.`,
        `4. Add a body if the change needs context beyond the subject line.`,
        `5. Run \`git commit -m "<message>"\` with the composed message.`,
      ].join('\n')
      files.push(repoFile(
        '.github/prompts/commit.prompt.md',
        buildPromptFile('Conventional Commit', 'Create a Conventional Commits formatted git commit for staged changes.', content),
      ))
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

// ─── Prompt file helper ──────────────────────────────────────────────────────

/**
 * Render `.github/prompts/<id>.prompt.md`.
 *
 * Follows the Copilot reusable prompt convention:
 *  - YAML frontmatter: description
 *  - Body: markdown instructions
 */
export function buildPromptFile(title: string, description: string, content: string): string {
  const lines = [
    '---',
    `description: "${description}"`,
    '---',
    '',
    content,
  ]
  return lines.join('\n')
}

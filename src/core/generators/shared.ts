/**
 * Shared helpers used by multiple generators.
 *
 * Keep this free of generator-specific logic — only primitives that two or
 * more generators would otherwise duplicate.
 */

import type { RepoFingerprint } from '../fingerprint/types.js'
import type { WorkflowConfig } from '../config/types.js'

// ─── Architecture style labels ────────────────────────────────────────────────

export const STYLE_LABELS: Record<string, string> = {
  cli:           'CLI tool',
  library:       'Library',
  monolith:      'Monolith',
  monorepo:      'Monorepo',
  microservices: 'Microservices',
}

// ─── Conventional commits detection ──────────────────────────────────────────

export function isConventionalCommits(fp: RepoFingerprint): boolean {
  return (
    fp.git?.commitStyle === 'conventional_commits' ||
    fp.conventions.some((c) => c.name === 'conventional_commits')
  )
}

// ─── Workflow rule lines ──────────────────────────────────────────────────────

/**
 * Returns the workflow rule bullet lines for a given WorkflowConfig.
 * Returns an empty array when all settings are 'never'.
 * Callers are responsible for wrapping lines in section markers / headings.
 */
export function buildWorkflowRuleLines(workflow: WorkflowConfig): string[] {
  const lines: string[] = []

  if (workflow.autoDocs === 'always') {
    lines.push('- **Documentation**: After adding or updating a feature, always update README.md and any relevant documentation files before marking the task complete.')
  } else if (workflow.autoDocs === 'ask') {
    lines.push('- **Documentation**: After adding or updating a feature, ask the user whether documentation (README.md, docs/) should be updated before finishing.')
  }

  if (workflow.autoCommit === 'always') {
    lines.push('- **Commits**: After completing a feature or fix, stage the relevant changed files and create a git commit with an appropriate message.')
  } else if (workflow.autoCommit === 'ask') {
    lines.push('- **Commits**: After completing a task, ask the user if they want to commit the changes.')
  }

  return lines
}

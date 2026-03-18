/**
 * Workspace map section renderer.
 *
 * buildWorkspaceMapSection() is a pure function that renders the
 * <!-- openskulls:section:workspace_map --> content for the root CLAUDE.md,
 * AGENTS.md, and copilot-instructions.md.
 *
 * It receives the lightweight WorkspaceMapEntry[] (not the full fingerprint)
 * so generators have no dependency on the fingerprint module.
 */

import type { WorkspaceMapEntry } from '../fingerprint/workspace-types.js'

/**
 * Render the workspace map as a markdown section.
 * Returns the inner content — callers wrap it in section tags.
 */
export function buildWorkspaceMapSection(workspaces: WorkspaceMapEntry[]): string {
  if (workspaces.length === 0) return ''

  const lines: string[] = [
    '## Workspace Map',
    '',
    '> This is a monorepo. Each workspace has its own AI context files.',
    '',
    '| Workspace | Path | Language | Framework |',
    '|---|---|---|---|',
  ]

  for (const ws of workspaces) {
    const lang = ws.primaryLanguage ?? '—'
    const fw = ws.primaryFramework ?? '—'
    lines.push(`| **${ws.name}** | \`${ws.path}/\` | ${lang} | ${fw} |`)
  }

  lines.push('')
  lines.push('### Cross-workspace rules')
  lines.push('')
  lines.push('- Each workspace is independently managed — do not create files in a workspace you are not working in.')
  lines.push('- Shared types and utilities belong in the designated shared workspace, not duplicated across workspaces.')
  lines.push('- Run `openskulls sync` from the repo root to update all workspace context files after structural changes.')
  lines.push('')

  return lines.join('\n')
}

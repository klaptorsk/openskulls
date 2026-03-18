/**
 * Architect guardrails builder — generates module-ownership rules and placement
 * constraints for large/complex projects. Unlike architect-review (a skill),
 * guardrails are embedded inline into AI instruction files so they are always active.
 *
 * isComplexProject() decides whether guardrails are needed.
 * generateArchitectGuardrails() invokes the AI CLI and returns typed ArchitectGuardrails.
 * buildGuardrailsSection() renders the markdown for embedding in instruction files.
 */

import Handlebars from 'handlebars'
import { z } from 'zod'
import { detectAICLI, invokeAICLI, stripJsonFences, type VerboseLogger } from './ai-collector.js'
import type { RepoFingerprint } from './types.js'
import { GUARDRAILS_TEMPLATE } from '../../generated/templates.js'

// ─── Template ─────────────────────────────────────────────────────────────────

const hbs = Handlebars.create()
const COMPILED = hbs.compile(GUARDRAILS_TEMPLATE, { noEscape: true })

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ModuleOwnership = z.object({
  path: z.string(),
  responsibility: z.string(),
  owns: z.array(z.string()).default([]),
  forbidden: z.array(z.string()).default([]),
})
export type ModuleOwnership = z.infer<typeof ModuleOwnership>

export const ArchitectGuardrails = z.object({
  summary: z.string(),
  moduleOwnership: z.array(ModuleOwnership).default([]),
  layerRules: z.array(z.string()).default([]),
  placementRules: z.array(z.string()).default([]),
  forbidden: z.array(z.string()).default([]),
})
export type ArchitectGuardrails = z.infer<typeof ArchitectGuardrails>

// ─── Complexity detection ─────────────────────────────────────────────────────

/**
 * Returns true when the repo is large/complex enough to warrant inline guardrails.
 * Heuristics: monorepo style, many modules, many frameworks, or many entry points.
 */
export function isComplexProject(fingerprint: RepoFingerprint): boolean {
  return (
    fingerprint.architecture.style === 'monorepo' ||
    fingerprint.architecture.moduleStructure.length >= 5 ||
    fingerprint.frameworks.length >= 4 ||
    fingerprint.architecture.entryPoints.length >= 3
  )
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildGuardrailsPrompt(
  fingerprint: RepoFingerprint,
  qa?: Record<string, string>,
  workspaceMap?: readonly import('./workspace-types.js').WorkspaceMapEntry[],
): string {
  const parts: string[] = []

  parts.push(`Project: ${fingerprint.repoName}`)
  if (fingerprint.description) parts.push(`Description: ${fingerprint.description}`)
  if (fingerprint.primaryLanguage) parts.push(`Primary language: ${fingerprint.primaryLanguage}`)
  if (fingerprint.architecture.style !== 'unknown') {
    parts.push(`Architecture: ${fingerprint.architecture.style}`)
  }
  if (fingerprint.architecture.entryPoints.length > 0) {
    parts.push(`Entry points: ${fingerprint.architecture.entryPoints.join(', ')}`)
  }
  if (fingerprint.architecture.moduleStructure.length > 0) {
    parts.push(`Module structure: ${fingerprint.architecture.moduleStructure.join(', ')}`)
  }
  if (fingerprint.frameworks.length > 0) {
    parts.push(
      `Frameworks: ${fingerprint.frameworks.map((f) => `${f.name} (${f.category})`).join(', ')}`,
    )
  }
  if (qa && Object.keys(qa).length > 0) {
    const prefLines = Object.entries(qa).map(([k, v]) => `- ${k}: ${v}`)
    parts.push(`User preferences:\n${prefLines.join('\n')}`)
  }
  if (workspaceMap && workspaceMap.length > 0) {
    const wsLines = workspaceMap.map((w) => `  - ${w.name} (${w.path}/)${w.primaryLanguage ? ` — ${w.primaryLanguage}` : ''}`)
    parts.push(`Workspaces:\n${wsLines.join('\n')}`)
  }

  return COMPILED({ projectSummary: parts.join('\n') })
}

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generateArchitectGuardrails(
  fingerprint: RepoFingerprint,
  logger?: VerboseLogger,
  qa?: Record<string, string>,
  workspaceMap?: readonly import('./workspace-types.js').WorkspaceMapEntry[],
): Promise<ArchitectGuardrails> {
  const cliCommand = await detectAICLI()
  const prompt = buildGuardrailsPrompt(fingerprint, qa, workspaceMap)
  const raw = await invokeAICLI(cliCommand, prompt, 120_000, logger)
  return ArchitectGuardrails.parse(JSON.parse(stripJsonFences(raw)))
}

// ─── Section renderer ─────────────────────────────────────────────────────────

/**
 * Render the guardrails as a markdown section for embedding in instruction files.
 * Wrapped in the openskulls section tag so it is managed across syncs.
 */
export function buildGuardrailsSection(guardrails: ArchitectGuardrails): string {
  const lines: string[] = []

  lines.push('## Architect Guardrails')
  lines.push('')
  lines.push(`> ${guardrails.summary}`)
  lines.push('')

  if (guardrails.moduleOwnership.length > 0) {
    lines.push('### Module Ownership')
    lines.push('')
    for (const mod of guardrails.moduleOwnership) {
      lines.push(`**\`${mod.path}\`** — ${mod.responsibility}`)
      if (mod.owns.length > 0) {
        lines.push(`- Owns: ${mod.owns.join(', ')}`)
      }
      if (mod.forbidden.length > 0) {
        lines.push(`- Must NOT contain: ${mod.forbidden.join(', ')}`)
      }
      lines.push('')
    }
  }

  if (guardrails.layerRules.length > 0) {
    lines.push('### Layer Rules')
    lines.push('')
    for (const rule of guardrails.layerRules) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
  }

  if (guardrails.placementRules.length > 0) {
    lines.push('### Placement Rules')
    lines.push('')
    for (const rule of guardrails.placementRules) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
  }

  if (guardrails.forbidden.length > 0) {
    lines.push('### Forbidden Patterns')
    lines.push('')
    for (const item of guardrails.forbidden) {
      lines.push(`- ${item}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

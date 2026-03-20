/**
 * Architect skill builder — generates the /architect-review skill via AI.
 *
 * generateArchitectSkill() invokes the AI CLI with fingerprint + workflow
 * config as input and returns a typed AISkill for the architect-review command.
 *
 * The prompt template lives at templates/prompts/architect.md.hbs and can be
 * edited directly to tune architect skill quality without touching TypeScript.
 */

import Handlebars from 'handlebars'
import { detectAICLI, invokeAICLI, stripJsonFences, type AICLIAdapter, type VerboseLogger } from './ai-collector.js'
import { AISkill } from './skills-builder.js'
import type { RepoFingerprint } from './types.js'
import type { WorkflowConfig } from '../config/types.js'
import { ARCHITECT_TEMPLATE } from '../../generated/templates.js'

// ─── Template loading ─────────────────────────────────────────────────────────

const hbs = Handlebars.create()
hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b)
const COMPILED = hbs.compile(ARCHITECT_TEMPLATE, { noEscape: true })

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildArchitectPrompt(
  fingerprint: RepoFingerprint,
  workflowConfig: WorkflowConfig,
  qa?: Record<string, string>,
): string {
  const {
    repoName,
    description,
    primaryLanguage,
    primaryFramework,
    languages,
    frameworks,
    architecture,
    testing,
    linting,
    conventions,
  } = fingerprint

  const parts: string[] = []

  parts.push(`Project: ${repoName}`)
  if (description) parts.push(`Description: ${description}`)
  if (primaryLanguage) parts.push(`Primary language: ${primaryLanguage}`)
  if (primaryFramework) parts.push(`Primary framework: ${primaryFramework}`)

  if (languages.length > 0) {
    parts.push(`Languages: ${languages.map((l) => `${l.name}${l.version ? ` ${l.version}` : ''}`).join(', ')}`)
  }

  if (frameworks.length > 0) {
    parts.push(`Frameworks: ${frameworks.map((f) => `${f.name}${f.version ? ` ${f.version}` : ''} (${f.category})`).join(', ')}`)
  }

  if (testing) {
    const pat = testing.pattern ? ` (${testing.pattern})` : ''
    parts.push(`Testing: ${testing.framework}${pat}`)
  }

  if (linting && linting.tools.length > 0) {
    parts.push(`Linting: ${linting.tools.join(', ')}`)
  }

  if (architecture.style !== 'unknown') {
    parts.push(`Architecture: ${architecture.style}`)
  }

  if (architecture.entryPoints.length > 0) {
    parts.push(`Entry points: ${architecture.entryPoints.join(', ')}`)
  }

  if (architecture.moduleStructure.length > 0) {
    parts.push(`Module structure: ${architecture.moduleStructure.join(', ')}`)
  }

  const relevantConventions = conventions.filter((c) => c.value !== undefined)
  if (relevantConventions.length > 0) {
    const convStr = relevantConventions.map((c) => `${c.name}=${c.value}`).join(', ')
    parts.push(`Conventions: ${convStr}`)
  }

  if (qa && Object.keys(qa).length > 0) {
    const prefLines = Object.entries(qa).map(([k, v]) => `- ${k}: ${v}`)
    parts.push(`User preferences:\n${prefLines.join('\n')}`)
  }

  const workflowParts: string[] = [
    `autoDocs: ${workflowConfig.autoDocs}`,
    `autoCommit: ${workflowConfig.autoCommit}`,
    `architectReview: ${workflowConfig.architectReview}`,
  ]

  return COMPILED({
    projectSummary:  parts.join('\n'),
    workflowSummary: workflowParts.join('\n'),
    architectDomain: workflowConfig.architectDomain,
    architectReview: workflowConfig.architectReview,
  })
}

// ─── Generator ────────────────────────────────────────────────────────────────

const ArchitectSkill = AISkill.extend({
  category: AISkill.shape.category.default('workflow'),
})

export async function generateArchitectSkill(
  fingerprint: RepoFingerprint,
  workflowConfig: WorkflowConfig,
  logger?: VerboseLogger,
  qa?: Record<string, string>,
  adapter?: AICLIAdapter,
): Promise<AISkill> {
  const cliCommand = adapter ?? await detectAICLI()
  const prompt = buildArchitectPrompt(fingerprint, workflowConfig, qa)
  const raw = await invokeAICLI(cliCommand, prompt, undefined, logger)
  return ArchitectSkill.parse(JSON.parse(stripJsonFences(raw)))
}

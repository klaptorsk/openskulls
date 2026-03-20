/**
 * AI questionnaire builder — generates repo-specific setup questions via AI.
 *
 * generateQuestionnaire() invokes the AI CLI with the fingerprint as context
 * and returns typed AIQuestion objects ready for the interviewer to present.
 *
 * Non-fatal: returns [] if the AI call fails or no CLI is found.
 * The prompt template lives at templates/prompts/questionnaire.md.hbs.
 */

import Handlebars from 'handlebars'
import { z } from 'zod'
import { detectAICLI, invokeAICLI, stripJsonFences, type AICLIAdapter, type VerboseLogger } from './ai-collector.js'
import type { RepoFingerprint } from './types.js'
import { QUESTIONNAIRE_TEMPLATE } from '../../generated/templates.js'

// ─── Template loading ─────────────────────────────────────────────────────────

const COMPILED = Handlebars.compile(QUESTIONNAIRE_TEMPLATE, { noEscape: true })

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const AIQuestion = z.object({
  id:      z.string().regex(/^[a-z0-9_]+$/),
  category: z.enum(['rules', 'workflow', 'agents', 'architect']),
  text:    z.string(),
  context: z.string(),
  type:    z.enum(['yesno', 'choice', 'text']),
  choices: z.array(z.string()).optional(),
  default: z.string().optional(),
})
export type AIQuestion = z.infer<typeof AIQuestion>

export const AIQuestionnaireResponse = z.object({
  questions: z.array(AIQuestion).min(0).max(8),
})

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildQuestionnairePrompt(fingerprint: RepoFingerprint): string {
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
    cicd,
    git,
    dependencies,
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

  if (architecture.style !== 'unknown') {
    parts.push(`Architecture: ${architecture.style}`)
  }

  if (architecture.apiStyle) {
    parts.push(`API style: ${architecture.apiStyle}`)
  }

  if (architecture.database) {
    parts.push(`Database: ${architecture.database}`)
  }

  if (architecture.hasMigrations) {
    parts.push(`Has migrations: yes`)
  }

  if (testing) {
    const pat = testing.pattern ? ` (${testing.pattern})` : ''
    parts.push(`Testing: ${testing.framework}${pat}`)
  }

  if (linting && linting.tools.length > 0) {
    parts.push(`Linting: ${linting.tools.join(', ')}`)
  }

  if (cicd) {
    const deploys = cicd.deployTargets.length > 0 ? ` → ${cicd.deployTargets.join(', ')}` : ''
    parts.push(`CI/CD: ${cicd.platform}${deploys}`)
  }

  if (git) {
    if (git.commitStyle) parts.push(`Commit style: ${git.commitStyle}`)
    if (git.branchStrategy) parts.push(`Branch strategy: ${git.branchStrategy}`)
    if (git.contributorsCount > 1) parts.push(`Contributors: ${git.contributorsCount}`)
  }

  const relevantConventions = conventions.filter((c) => c.value !== undefined)
  if (relevantConventions.length > 0) {
    parts.push(`Conventions: ${relevantConventions.map((c) => `${c.name}=${c.value}`).join(', ')}`)
  }

  // Surface notable runtime deps for context (top-level packages only)
  const allRuntime = dependencies.flatMap((d) => Object.keys(d.runtime))
  if (allRuntime.length > 0) {
    parts.push(`Key dependencies: ${allRuntime.slice(0, 15).join(', ')}`)
  }

  return COMPILED({ projectSummary: parts.join('\n') })
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate contextual setup questions from the repo fingerprint.
 * Non-fatal: returns an empty array if the AI call fails.
 */
export async function generateQuestionnaire(
  fingerprint: RepoFingerprint,
  logger?: VerboseLogger,
  adapter?: AICLIAdapter,
): Promise<AIQuestion[]> {
  try {
    const cliCommand = adapter ?? await detectAICLI()
    const prompt = buildQuestionnairePrompt(fingerprint)
    const raw = await invokeAICLI(cliCommand, prompt, 60_000, logger)
    const parsed = AIQuestionnaireResponse.parse(JSON.parse(stripJsonFences(raw)))
    return parsed.questions
  } catch {
    return []
  }
}

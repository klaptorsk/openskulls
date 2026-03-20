/**
 * AI skills builder — generates project-specific skills via a second AI call.
 *
 * generateAISkills() invokes the AI CLI with the fingerprint as structured
 * input and returns typed AISkill objects ready for the generator to emit.
 */

import { z } from 'zod'
import { detectAICLI, invokeAICLI, stripJsonFences, type VerboseLogger } from './ai-collector.js'
import { buildSkillsPrompt } from './skills-prompt.js'
import type { RepoFingerprint } from './types.js'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const AISkill = z.object({
  id:          z.string().regex(/^[a-z0-9-]+$/),   // kebab-case → directory name
  title:       z.string(),                           // "Add a New API Route"
  description: z.string(),                           // trigger description → frontmatter
  content:     z.string(),                           // full markdown body of SKILL.md
  category:    z.enum(['workflow', 'testing', 'debugging', 'refactoring', 'documentation', 'devops', 'methodology', 'process', 'security', 'other']),
})
export type AISkill = z.infer<typeof AISkill>

export const AISkillsResponse = z.object({
  skills: z.array(AISkill).default([]),
})
export type AISkillsResponse = z.infer<typeof AISkillsResponse>

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generateAISkills(
  fingerprint: RepoFingerprint,
  logger?: VerboseLogger,
  qa?: Record<string, string>,
): Promise<AISkill[]> {
  const cliCommand = await detectAICLI()
  const prompt = buildSkillsPrompt(fingerprint, qa)
  const raw = await invokeAICLI(cliCommand, prompt, undefined, logger)
  const parsed = AISkillsResponse.parse(JSON.parse(stripJsonFences(raw)))
  return parsed.skills
}

/**
 * AI methodology skills builder — generates project-specific methodology
 * skills via an AI call.
 *
 * generateMethodologySkills() invokes the AI CLI with the fingerprint as
 * structured input and returns typed AISkill objects ready for the generator.
 */

import { z } from 'zod'
import { detectAICLI, invokeAICLI, stripJsonFences, type VerboseLogger } from './ai-collector.js'
import { buildMethodologyPrompt } from './methodology-prompt.js'
import type { RepoFingerprint } from './types.js'
import type { AISkill } from './skills-builder.js'

const VALID_METHODOLOGY_IDS = ['architect', 'workflow-lifecycle', 'verify', 'tdd'] as const

const MethodologySkill = z.object({
  id:          z.enum(VALID_METHODOLOGY_IDS),
  title:       z.string(),
  description: z.string(),
  content:     z.string(),
  category:    z.enum(['methodology', 'process', 'security']),
})

export const MethodologySkillsResponse = z.object({
  skills: z.array(MethodologySkill).default([]),
})
export type MethodologySkillsResponse = z.infer<typeof MethodologySkillsResponse>

export async function generateMethodologySkills(
  fingerprint: RepoFingerprint,
  logger?: VerboseLogger,
  qa?: Record<string, string>,
  installedPackSkillIds?: string[],
  taskSkillIds?: string[],
): Promise<AISkill[]> {
  const cliCommand = await detectAICLI()
  const prompt = buildMethodologyPrompt(fingerprint, qa, installedPackSkillIds, taskSkillIds)
  const raw = await invokeAICLI(cliCommand, prompt, 120_000, logger)
  const parsed = MethodologySkillsResponse.parse(JSON.parse(stripJsonFences(raw)))
  return parsed.skills
}

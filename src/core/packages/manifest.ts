/**
 * SkullPackManifest — Zod schema for the on-disk skull-pack.toml format.
 *
 * This is the TOML manifest that lives at the root of a skill pack git repo.
 * The loader (loader.ts) transforms this into the in-memory SkullPackage type
 * by reading file contents from the referenced paths.
 */

import { z } from 'zod'

export const ManifestSkillEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string(),
  category: z.string().default('workflow'),
  tool_compatibility: z.array(z.string()).default([]),
})
export type ManifestSkillEntry = z.infer<typeof ManifestSkillEntry>

export const ManifestRuleEntry = z.object({
  id: z.string(),
  path: z.string(),
  section: z.string().default('codeStyle'),
  severity: z.enum(['error', 'warn', 'info']).default('warn'),
})
export type ManifestRuleEntry = z.infer<typeof ManifestRuleEntry>

export const SkullPackManifest = z.object({
  schema_version: z.string().default('1.0.0'),
  name: z.string(),
  description: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  applies_when: z.object({
    frameworks: z.array(z.string()).default([]),
    languages: z.array(z.string()).default([]),
  }).default({ frameworks: [], languages: [] }),
  skills: z.array(ManifestSkillEntry).default([]),
  rules: z.array(ManifestRuleEntry).default([]),
})
export type SkullPackManifest = z.infer<typeof SkullPackManifest>

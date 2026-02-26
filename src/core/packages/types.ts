/**
 * Data types for the OpenSkulls package ecosystem.
 *
 * A SkullPackage is the distributable unit: a versioned collection of Skills
 * and Rules installable via `openskulls add @scope/name`.
 */

import { z } from 'zod'

// ─── Building blocks ─────────────────────────────────────────────────────────

export const PackageDependency = z.object({
  name: z.string(),                           // "@openskulls/react"
  versionConstraint: z.string().default('*'), // "^1.0.0"
})
export type PackageDependency = z.infer<typeof PackageDependency>

export const SkillParameter = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
  defaultValue: z.string().optional(),
})
export type SkillParameter = z.infer<typeof SkillParameter>

// ─── Skill ───────────────────────────────────────────────────────────────────

/**
 * A single reusable workflow — maps to one .claude/commands/<id>.md file.
 *
 * Content is plain markdown. No DSL, no custom syntax.
 * dependsOn allows skills to compose other skills by ID.
 */
export const Skill = z.object({
  id: z.string(),                             // "commit", "review-pr"
  name: z.string(),
  description: z.string(),
  content: z.string(),                        // Full markdown content
  parameters: z.array(SkillParameter).default([]),
  tags: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]), // Other skill IDs this composes
  toolCompatibility: z.array(z.string()).default([]), // [] = all tools
})
export type Skill = z.infer<typeof Skill>

// ─── Rule ────────────────────────────────────────────────────────────────────

/**
 * A single behavioral constraint for an AI tool.
 * Content is plain markdown, grouped into CLAUDE.md sections.
 */
export const Rule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  content: z.string(),
  severity: z.enum(['error', 'warn', 'info']).default('warn'),
  section: z.string().default('codeStyle'),   // "codeStyle" | "architecture" | "security" | "workflow"
  tags: z.array(z.string()).default([]),
  toolCompatibility: z.array(z.string()).default([]),
})
export type Rule = z.infer<typeof Rule>

// ─── SkullPackage ────────────────────────────────────────────────────────────

export const SkullPackage = z.object({
  schemaVersion: z.string().default('1.0.0'),
  name: z.string(),                           // "@openskulls/react"
  version: z.string(),                        // Strict semver: "1.2.3"
  description: z.string(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  tags: z.array(z.string()).default([]),

  // Auto-install matching — which repos should get this package suggested?
  appliesWhen: z.object({
    frameworks: z.array(z.string()).default([]),
    languages: z.array(z.string()).default([]),
  }).default({ frameworks: [], languages: [] }),

  skills: z.array(Skill).default([]),
  rules: z.array(Rule).default([]),

  // Additional context sections injected into the generated CLAUDE.md
  contextSections: z.record(z.string(), z.string()).default({}),

  dependencies: z.array(PackageDependency).default([]),
  peerDependencies: z.array(PackageDependency).default([]),
})
export type SkullPackage = z.infer<typeof SkullPackage>

// ─── Lockfile ────────────────────────────────────────────────────────────────

export const LockfileEntry = z.object({
  resolvedVersion: z.string(),
  contentHash: z.string(),
  source: z.enum(['registry', 'local', 'github']).default('registry'),
  sourceUrl: z.string().optional(),
})
export type LockfileEntry = z.infer<typeof LockfileEntry>

export const Lockfile = z.object({
  schemaVersion: z.string().default('1.0.0'),
  packages: z.record(z.string(), LockfileEntry).default({}),
})
export type Lockfile = z.infer<typeof Lockfile>

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function skillsForTool(pkg: SkullPackage, toolId: string): Skill[] {
  return pkg.skills.filter(
    (s) => s.toolCompatibility.length === 0 || s.toolCompatibility.includes(toolId),
  )
}


/**
 * Types for foreign AI instruction file detection.
 *
 * A "foreign" file is an AI instruction file (CLAUDE.md, AGENTS.md, etc.)
 * that exists in the repo but was not generated or managed by openskulls —
 * i.e. it has no <!-- openskulls:section:... --> markers.
 *
 * ForeignFileScan is the result of scanning a repo root for foreign files
 * and unmanaged skill files.
 */

import { z } from 'zod'

export const ForeignFileContext = z.object({
  /** Path relative to repo root */
  path: z.string(),
  /** Raw file content */
  content: z.string(),
  /** Conventions extracted by AI (populated in B2 phase) */
  extractedConventions: z.array(z.string()).default([]),
  /** Rules extracted by AI (populated in B2 phase) */
  extractedRules: z.array(z.string()).default([]),
  /** Architectural constraints extracted by AI (populated in B2 phase) */
  extractedConstraints: z.array(z.string()).default([]),
  /** One-sentence summary from AI (populated in B2 phase) */
  summary: z.string().optional(),
})
export type ForeignFileContext = z.infer<typeof ForeignFileContext>

export const ForeignFileScan = z.object({
  /** Foreign AI instruction files found at well-known paths */
  foreignFiles: z.array(ForeignFileContext).default([]),
  /** Relative paths to unmanaged .claude/commands/*.md skill files */
  foreignSkills: z.array(z.string()).default([]),
})
export type ForeignFileScan = z.infer<typeof ForeignFileScan>

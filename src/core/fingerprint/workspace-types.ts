/**
 * Types for monorepo / multi-workspace analysis.
 *
 * WorkspaceFingerprint wraps a per-workspace RepoFingerprint with its
 * path metadata. MonorepoAnalysis is the result of a two-pass analysis
 * where each workspace is fingerprinted independently before the root
 * aggregate is synthesised.
 */

import { z } from 'zod'
import { RepoFingerprint, ConventionSignal } from './types.js'

export const WorkspaceFingerprint = z.object({
  /** Relative path from repo root (e.g. "packages/api") */
  path: z.string(),
  /** Display name (e.g. "API Service") */
  name: z.string(),
  fingerprint: RepoFingerprint,
  /** Tool IDs to generate for this workspace */
  targets: z.array(z.string()).default([]),
})
export type WorkspaceFingerprint = z.infer<typeof WorkspaceFingerprint>

/** Lightweight summary used in the root workspace_map section */
export interface WorkspaceMapEntry {
  path: string
  name: string
  primaryLanguage?: string
  primaryFramework?: string
  architectureStyle?: string
}

/** Result of a full two-pass monorepo analysis */
export interface MonorepoAnalysis {
  rootFingerprint: RepoFingerprint
  workspaces: WorkspaceFingerprint[]
  crossCuttingConventions: ConventionSignal[]
}

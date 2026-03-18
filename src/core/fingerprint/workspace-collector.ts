/**
 * Workspace fingerprint collector.
 *
 * collectWorkspaceFingerprints() runs AIFingerprintCollector.collect() for
 * each discovered workspace, returning per-workspace RepoFingerprints.
 *
 * buildAggregateFingerprint() synthesises a root-level RepoFingerprint from
 * the workspace set — sets style='monorepo', merges language signals, and
 * identifies cross-cutting conventions.
 *
 * extractCrossCuttingConventions() finds conventions present in 2+ workspaces.
 */

import { basename } from 'node:path'
import { AIFingerprintCollector, type AICLIAdapter, type VerboseLogger } from './ai-collector.js'
import { createFingerprint, type ConventionSignal, type RepoFingerprint } from './types.js'
import { type WorkspaceFingerprint, type WorkspaceMapEntry } from './workspace-types.js'
import type { WorkspaceEntry } from '../config/types.js'

// ─── Per-workspace collection ─────────────────────────────────────────────────

/**
 * Fingerprint each workspace independently using AIFingerprintCollector.
 *
 * Failures are non-fatal: a failed workspace is omitted from results and
 * a warning is recorded in the returned `errors` map.
 *
 * When useParallel is true (useSubagents setting), all AI calls run in
 * parallel via Promise.allSettled.
 */
export async function collectWorkspaceFingerprints(
  repoRoot: string,
  workspaces: WorkspaceEntry[],
  adapter: AICLIAdapter,
  options: { useParallel?: boolean } = {},
  logger?: VerboseLogger,
): Promise<{ results: WorkspaceFingerprint[]; errors: Map<string, string> }> {
  const collector = new AIFingerprintCollector()
  const errors = new Map<string, string>()

  async function fingerprintOne(ws: WorkspaceEntry): Promise<WorkspaceFingerprint | null> {
    const absPath = `${repoRoot}/${ws.path}`
    try {
      const fp = await collector.collect(absPath, undefined, logger, adapter)
      return {
        path: ws.path,
        name: ws.name ?? basename(ws.path),
        fingerprint: fp,
        targets: ws.targets ?? [],
      }
    } catch (err) {
      errors.set(ws.path, err instanceof Error ? err.message : String(err))
      return null
    }
  }

  let settled: Array<WorkspaceFingerprint | null>

  if (options.useParallel) {
    const promises = workspaces.map((ws) => fingerprintOne(ws))
    settled = await Promise.all(promises)
  } else {
    settled = []
    for (const ws of workspaces) {
      settled.push(await fingerprintOne(ws))
    }
  }

  const results = settled.filter((r): r is WorkspaceFingerprint => r !== null)
  return { results, errors }
}

// ─── Cross-cutting conventions ────────────────────────────────────────────────

/**
 * Find conventions that appear in at least `minCount` workspaces.
 * Convention identity is based on the `name` field.
 */
export function extractCrossCuttingConventions(
  workspaces: WorkspaceFingerprint[],
  minCount = 2,
): ConventionSignal[] {
  if (workspaces.length < minCount) return []

  const counts = new Map<string, { signal: ConventionSignal; count: number }>()
  for (const ws of workspaces) {
    for (const c of ws.fingerprint.conventions) {
      const existing = counts.get(c.name)
      if (existing) {
        existing.count++
      } else {
        counts.set(c.name, { signal: c, count: 1 })
      }
    }
  }

  return [...counts.values()]
    .filter(({ count }) => count >= minCount)
    .map(({ signal }) => signal)
}

// ─── Aggregate fingerprint ────────────────────────────────────────────────────

/**
 * Synthesise a root-level RepoFingerprint from a set of workspace fingerprints.
 *
 * The aggregate:
 * - Sets architecture.style = 'monorepo'
 * - Sets moduleStructure to the list of workspace paths
 * - Collects cross-cutting conventions (present in 2+ workspaces)
 * - Merges language signals (de-duplicated by name, highest percentage wins)
 * - Carries the root repo description if provided
 */
export function buildAggregateFingerprint(
  repoRoot: string,
  workspaces: WorkspaceFingerprint[],
  description?: string,
): RepoFingerprint {
  const crossConventions = extractCrossCuttingConventions(workspaces)

  // Merge language signals — sum percentages, then normalize so they add to 100
  const langMap = new Map<string, { name: string; version?: string | null; totalPct: number; count: number }>()
  for (const ws of workspaces) {
    for (const lang of ws.fingerprint.languages) {
      const existing = langMap.get(lang.name)
      if (existing) {
        existing.totalPct += lang.percentage
        existing.count++
        if (!existing.version && lang.version) existing.version = lang.version
      } else {
        langMap.set(lang.name, { name: lang.name, version: lang.version ?? null, totalPct: lang.percentage, count: 1 })
      }
    }
  }

  const totalPct = [...langMap.values()].reduce((sum, l) => sum + l.totalPct, 0) || 1
  const languages = [...langMap.values()].map((l) => ({
    name: l.name,
    version: l.version,
    confidence: 'high' as const,
    percentage: Math.round((l.totalPct / totalPct) * 100),
    primary: false,
    evidence: [],
  }))

  // Mark primary language
  const maxPct = Math.max(...languages.map((l) => l.percentage), 0)
  const mergedLanguages = languages.map((l) => ({ ...l, primary: l.percentage === maxPct }))
  const primaryLang = mergedLanguages.find((l) => l.primary)

  return createFingerprint({
    repoRoot,
    repoName: basename(repoRoot),
    languages: mergedLanguages,
    frameworks: [],
    conventions: crossConventions,
    dependencies: [],
    architecture: {
      style: 'monorepo',
      entryPoints: [],
      moduleStructure: workspaces.map((ws) => ws.path),
      hasMigrations: false,
    },
    aiCLIs: [],
    description,
    primaryLanguage: primaryLang?.name,
  })
}

// ─── Workspace map ────────────────────────────────────────────────────────────

/** Convert WorkspaceFingerprint[] to the lightweight WorkspaceMapEntry[] used by generators. */
export function toWorkspaceMapEntries(workspaces: WorkspaceFingerprint[]): WorkspaceMapEntry[] {
  return workspaces.map((ws) => ({
    path: ws.path,
    name: ws.name,
    primaryLanguage: ws.fingerprint.primaryLanguage,
    primaryFramework: ws.fingerprint.primaryFramework,
    architectureStyle: ws.fingerprint.architecture.style !== 'unknown'
      ? ws.fingerprint.architecture.style
      : undefined,
  }))
}

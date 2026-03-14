/**
 * Configuration types for OpenSkulls.
 *
 * ProjectConfig  — [repo]/.openskulls/config.json  (committed, shared with team)
 * GlobalConfig   — ~/.openskulls/config.json        (personal, never committed)
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { parse as tomlParse } from 'smol-toml'
import { PackageDependency } from '../packages/types.js'

// ─── ProjectConfig ────────────────────────────────────────────────────────────

export const ToolTarget = z.object({
  name: z.string(),                               // "claude_code", "cursor", "cline"
  enabled: z.boolean().default(true),
  outputPath: z.string().optional(),              // Override the default output location
})
export type ToolTarget = z.infer<typeof ToolTarget>

export const SyncConfig = z.object({
  autoSyncOnCommit: z.boolean().default(true),
  autoSyncOnMerge: z.boolean().default(true),

  // File patterns that, when changed in a commit, trigger a sync check
  triggerPatterns: z.array(z.string()).default([
    'package.json',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'requirements*.txt',
    '*.lock',
    'docker-compose*.yml',
    '.github/workflows/**',
  ]),

  // Warn after this many commits without a sync
  driftThresholdCommits: z.number().int().default(10),
})
export type SyncConfig = z.infer<typeof SyncConfig>

export const WorkflowConfig = z.object({
  autoDocs:         z.enum(['always', 'ask', 'never']).default('ask'),
  autoCommit:       z.enum(['always', 'ask', 'never']).default('ask'),
  architectEnabled: z.boolean().default(false),
  architectDomain:  z.string().default(''),
  architectReview:  z.enum(['always', 'ask', 'never']).default('ask'),
  useSubagents:     z.boolean().default(false),
})
export type WorkflowConfig = z.infer<typeof WorkflowConfig>

/**
 * Full user context collected during `openskulls init`.
 * Combines static workflow preferences with AI-generated Q&A answers.
 * The qa map is persisted under [workflow.answers] in config.toml.
 */
export const UserContext = z.object({
  workflowConfig: WorkflowConfig,
  qa: z.record(z.string(), z.string()).default({}),
})
export type UserContext = z.infer<typeof UserContext>

export const ProjectConfig = z.object({
  schemaVersion: z.string().default('1.0.0'),

  // Installed packages (name + version constraint)
  packages: z.array(PackageDependency).default([]),

  // Which AI tools to generate context for
  targets: z.array(ToolTarget).default([]),

  sync: SyncConfig.default({}),

  workflow: WorkflowConfig.default({}),

  // Paths excluded from repo analysis
  excludePaths: z.array(z.string()).default([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.venv',
    '__pycache__',
    '.next',
    '.nuxt',
    'coverage',
  ]),

  // Manual overrides for mis-detected fingerprint signals
  fingerprintOverrides: z.record(z.string(), z.unknown()).default({}),
})
export type ProjectConfig = z.infer<typeof ProjectConfig>

// ─── GlobalConfig ─────────────────────────────────────────────────────────────

export const DeveloperProfile = z.object({
  name: z.string().optional(),
  preferredEditor: z.string().optional(),
  codingStyleNotes: z.string().optional(),
  personalRules: z.array(z.string()).default([]),
})
export type DeveloperProfile = z.infer<typeof DeveloperProfile>

export const GlobalConfig = z.object({
  schemaVersion: z.string().default('1.0.0'),
  registryUrl: z.string().optional(),
  authToken: z.string().optional(),
  preferredTools: z.array(z.string()).default(['claude_code']),
  globalPackages: z.array(PackageDependency).default([]),
  developerProfile: DeveloperProfile.default({}),
})
export type GlobalConfig = z.infer<typeof GlobalConfig>

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function defaultProjectConfig(): ProjectConfig {
  return ProjectConfig.parse({})
}

export function defaultGlobalConfig(): GlobalConfig {
  return GlobalConfig.parse({})
}

/**
 * Read [repo]/.openskulls/config.toml and return the set of enabled tool IDs.
 * Falls back to ['claude_code'] if the file is missing, malformed, or has no targets.
 */
export async function loadEnabledTargets(repoRoot: string): Promise<Set<string>> {
  const configPath = join(repoRoot, '.openskulls', 'config.toml')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = tomlParse(raw) as Record<string, unknown>
    const targets = parsed['targets']
    if (!Array.isArray(targets) || targets.length === 0) return new Set(['claude_code'])
    const enabled = (targets as Array<Record<string, unknown>>)
      .filter((t) => t['enabled'] !== false)
      .map((t) => String(t['name']))
    return enabled.length > 0 ? new Set(enabled) : new Set(['claude_code'])
  } catch {
    return new Set(['claude_code'])
  }
}

/**
 * Read [repo]/.openskulls/config.toml and extract the [workflow] section.
 * Returns defaults if the file is missing or malformed.
 */
export async function loadWorkflowConfig(repoRoot: string): Promise<WorkflowConfig> {
  const configPath = join(repoRoot, '.openskulls', 'config.toml')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = tomlParse(raw) as Record<string, unknown>
    const wf = parsed['workflow'] as Record<string, unknown> | undefined
    if (!wf) return WorkflowConfig.parse({})
    return WorkflowConfig.parse({
      autoDocs:         wf['auto_docs'],
      autoCommit:       wf['auto_commit'],
      architectEnabled: wf['architect_enabled'],
      architectDomain:  wf['architect_domain'],
      architectReview:  wf['architect_review'],
      useSubagents:     wf['use_subagents'],
    })
  } catch {
    return WorkflowConfig.parse({})
  }
}

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

// ─── WorkspaceConfig ──────────────────────────────────────────────────────────

export const WorkspaceEntry = z.object({
  /** Relative path from repo root, e.g. "packages/api" */
  path: z.string(),
  /** Display name — defaults to basename of path */
  name: z.string().optional(),
  /** Which generators to enable (defaults to root targets when omitted) */
  targets: z.array(z.string()).optional(),
  /** Exclude this workspace from discovery and generation */
  disabled: z.boolean().default(false),
})
export type WorkspaceEntry = z.infer<typeof WorkspaceEntry>

export const WorkspaceConfig = z.object({
  /** When true, auto-discovery is disabled; only declared entries are used */
  manual: z.boolean().default(false),
  /** Explicit workspace declarations (supplements or replaces auto-discovery) */
  entries: z.array(WorkspaceEntry).default([]),
  /** Glob-style path prefixes to exclude from auto-discovery */
  excludePatterns: z.array(z.string()).default([]),
  /** How deep to scan for workspace manifests (default 3) */
  maxDepth: z.number().int().min(1).max(6).default(3),
})
export type WorkspaceConfig = z.infer<typeof WorkspaceConfig>

export const ProjectConfig = z.object({
  schemaVersion: z.string().default('1.0.0'),

  // Installed packages (name + version constraint)
  packages: z.array(PackageDependency).default([]),

  // Which AI tools to generate context for
  targets: z.array(ToolTarget).default([]),

  sync: SyncConfig.default({}),

  workflow: WorkflowConfig.default({}),

  workspaces: WorkspaceConfig.optional(),

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

/**
 * Read [repo]/.openskulls/config.toml and return the set of enabled target names.
 * Falls back to ['claude_code'] if the file is missing or has no targets.
 */
export async function loadEnabledTargets(repoRoot: string): Promise<Set<string>> {
  const configPath = join(repoRoot, '.openskulls', 'config.toml')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = tomlParse(raw) as Record<string, unknown>
    const targets = parsed['targets'] as Array<{ name?: string; enabled?: boolean }> | undefined
    if (targets && targets.length > 0) {
      const enabled = targets
        .filter((t) => t.enabled !== false && typeof t.name === 'string')
        .map((t) => t.name as string)
      if (enabled.length > 0) return new Set(enabled)
    }
  } catch {
    // missing or malformed config
  }
  return new Set(['claude_code'])
}

export function defaultGlobalConfig(): GlobalConfig {
  return GlobalConfig.parse({})
}

/**
 * Read [repo]/.openskulls/config.toml and extract the [workspaces] section.
 * Returns undefined if the section is absent or the file is missing.
 */
export async function loadWorkspaceConfig(repoRoot: string): Promise<WorkspaceConfig | undefined> {
  const configPath = join(repoRoot, '.openskulls', 'config.toml')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = tomlParse(raw) as Record<string, unknown>
    const ws = parsed['workspaces'] as Record<string, unknown> | undefined
    if (!ws) return undefined
    return WorkspaceConfig.parse({
      manual:          ws['manual'],
      entries:         ws['entries'],
      excludePatterns: ws['exclude_patterns'],
      maxDepth:        ws['max_depth'],
    })
  } catch {
    return undefined
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

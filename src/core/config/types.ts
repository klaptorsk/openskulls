/**
 * Configuration types for OpenSkulls.
 *
 * ProjectConfig  — [repo]/.openskulls/config.json  (committed, shared with team)
 * GlobalConfig   — ~/.openskulls/config.json        (personal, never committed)
 */

import { z } from 'zod'
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
  autoDocs:   z.enum(['always', 'ask', 'never']).default('ask'),
  autoCommit: z.enum(['always', 'ask', 'never']).default('ask'),
})
export type WorkflowConfig = z.infer<typeof WorkflowConfig>

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
  registryUrl: z.string().default('https://registry.openskulls.dev'),
  authToken: z.string().optional(),
  preferredTools: z.array(z.string()).default(['claude_code']),
  globalPackages: z.array(PackageDependency).default([]),
  developerProfile: DeveloperProfile.default({}),
})
export type GlobalConfig = z.infer<typeof GlobalConfig>

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function enabledToolNames(config: ProjectConfig): string[] {
  return config.targets.filter((t) => t.enabled).map((t) => t.name)
}

export function hasTool(config: ProjectConfig, toolId: string): boolean {
  return config.targets.some((t) => t.name === toolId && t.enabled)
}

export function defaultProjectConfig(): ProjectConfig {
  return ProjectConfig.parse({})
}

export function defaultGlobalConfig(): GlobalConfig {
  return GlobalConfig.parse({})
}

---
name: add-config-field
description: >
  Use when adding new fields to ProjectConfig or GlobalConfig.
  Triggers: config field, config.toml, ProjectConfig, GlobalConfig, smol-toml, config schema, openskulls config.
---

# Add a Config Field

Reference for extending the openskulls configuration schemas used by `init` and `sync`.

## Core Rules

- All config schemas are Zod objects in `src/core/config/types.ts`
- `ProjectConfig` maps to `.openskulls/config.toml` (per-repo, committed)
- `GlobalConfig` maps to `~/.config/openskulls/config.toml` (user-global, never committed)
- New fields MUST have `.default()` or `.optional()` — existing config files must continue to parse
- Use `z.infer<typeof ProjectConfigSchema>` as the TypeScript type — never write a manual interface
- Config is loaded/saved via helpers in `src/core/config/` — do not use `smol-toml` directly outside that module
- After adding a field, update the generated config comment block in `init.ts` so users see the new option

## Key Files

```
src/core/config/types.ts          — ProjectConfigSchema, GlobalConfigSchema, z.infer types
src/core/config/index.ts          — loadProjectConfig(), saveProjectConfig(), loadGlobalConfig()
src/cli/commands/init.ts          — writes initial config.toml after init
```

## Pattern

```typescript
// src/core/config/types.ts
export const ProjectConfigSchema = z.object({
  version: z.string().default('1'),
  // ... existing fields ...
  myNewOption: z.boolean().default(false),   // always provide a default
  myOptionalUrl: z.string().optional(),
})
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>
```

## Anti-Patterns

- Do not add required fields without `.default()` — will break parse on repos that haven't re-run `init`
- Do not access `smol-toml` directly in command files — go through the config helpers
- Do not store secrets or tokens in `ProjectConfig` (committed file) — use `GlobalConfig` for those

## Checklist

- [ ] Field added to correct schema (`ProjectConfigSchema` or `GlobalConfigSchema`) with `.default()` or `.optional()`
- [ ] Config helper updated if load/save needs to handle the new field specially
- [ ] `init.ts` updated to write the new field into the generated `config.toml` with a comment
- [ ] Test added: existing config without the field still parses correctly
- [ ] `npm test` passes
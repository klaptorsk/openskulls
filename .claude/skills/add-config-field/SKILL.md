---
name: add-config-field
description: >
  Use when adding new fields to ProjectConfig or GlobalConfig.
  Triggers: config field, config.toml, ProjectConfig, GlobalConfig, smol-toml, config schema, openskulls config.
---

# Add a Config Field

Reference for safely extending the project or global config schemas with new user-facing fields.

## Core Rules

- Config schemas live in `src/core/config/types.ts` — `ProjectConfigSchema`, `GlobalConfigSchema`
- All types are `z.infer<typeof Schema>` — never write a parallel TypeScript interface
- New fields MUST be `.optional()` or have a `.default()` — existing `config.toml` files must remain valid
- Config is parsed with `smol-toml` then validated with Zod — keep field names TOML-friendly (snake_case)
- `ProjectConfig` is per-repo (`.openskulls/config.toml`); `GlobalConfig` is user-level (`~/.openskulls/config.toml`)
- Consumers read config via the parsed Zod type — never access raw TOML directly outside the config module

## Key Files

```
src/core/config/types.ts         — ProjectConfigSchema, GlobalConfigSchema + z.infer<> exports
src/cli/commands/init.ts         — reads + writes ProjectConfig after init
src/cli/commands/sync.ts         — reads ProjectConfig to drive sync behaviour
```

## Pattern

```typescript
// src/core/config/types.ts
export const ProjectConfigSchema = z.object({
  engine: z.string(),
  targets: z.array(z.string()),
  myNewField: z.string().optional(), // always optional for compat
})
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>
```

## Anti-Patterns

- Do not add required fields — breaks existing user config files on upgrade
- Do not use camelCase in TOML keys — use snake_case for TOML compatibility
- Do not access `config.myNewField` without checking `=== undefined` if optional with no default
- Do not duplicate config parsing logic — always go through the Zod schema

## Checklist

- [ ] Field added to correct schema (`ProjectConfigSchema` or `GlobalConfigSchema`) with `.optional()` or `.default()`
- [ ] `z.infer<>` type automatically updated (no manual type edit needed)
- [ ] Consumers updated to use the new field
- [ ] Test added covering config parse with and without the new field
- [ ] `npm test` passes
- [ ] README.md updated with new config option documentation
---
name: add-config-field
description: >
  Use when adding new fields to ProjectConfig or GlobalConfig.
  Triggers: config field, config.toml, ProjectConfig, GlobalConfig, smol-toml, config schema, openskulls config.
---

# Add a Config Field

Reference for extending the project or global configuration schemas in openskulls.

## Core Rules

- All config schemas are defined with Zod in `src/core/config/types.ts`
- `ProjectConfig` maps to `.openskulls/config.toml` (repo-local, committed)
- `GlobalConfig` maps to `~/.config/openskulls/config.toml` (user-level, not committed)
- New fields should use `.optional()` with a sensible `.default()` to avoid breaking existing config files
- TOML is parsed with `smol-toml` — stick to types it supports: string, number, boolean, array, inline table
- Config is read and written in `src/cli/commands/init.ts` and `src/cli/commands/sync.ts` — update both if needed
- Exported types must use `z.infer<typeof ConfigSchema>` pattern

## Key Files

| File | Purpose |
|---|---|
| `src/core/config/types.ts` | `ProjectConfigSchema`, `GlobalConfigSchema`, inferred types |
| `.openskulls/config.toml` | Example project config for this repo |
| `src/cli/commands/init.ts` | Reads, mutates, and writes `ProjectConfig` |

## Pattern

```typescript
// src/core/config/types.ts
export const ProjectConfigSchema = z.object({
  // ... existing fields ...
  myNewField: z.string().optional().default('default-value'),
})
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>
```

## Anti-Patterns

- Do not add required fields without defaults — existing `config.toml` files missing the field will fail Zod parse
- Do not use complex nested objects — `smol-toml` support for deep nesting can be inconsistent
- Do not read config with raw `JSON.parse` or string splitting — always go through the Zod schema

## Checklist

- [ ] Field added to correct schema in `src/core/config/types.ts` with `.optional().default()`
- [ ] CLI commands that read/write config updated if needed
- [ ] Test added verifying parse succeeds without the field present (backwards compat)
- [ ] `npm test` passes
- [ ] README.md updated if field is user-facing
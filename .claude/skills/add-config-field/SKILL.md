---
name: add-config-field
description: >
  Use when adding new fields to ProjectConfig or GlobalConfig that are persisted to config.toml.
  Triggers: new config option, config field, ProjectConfig, GlobalConfig, config.toml, smol-toml, user preference, persist setting.
---

# Add a Config Field

Reference for safely adding fields to the openskulls configuration schemas backed by `config.toml`.

## Core Rules

- All config schemas are defined in `src/core/config/types.ts` using Zod — never write manual TypeScript interfaces
- New fields MUST use `.optional()` or `.default()` — existing `config.toml` files on user machines must still parse without error
- Use `smol-toml` for all TOML serialisation/deserialisation — do not use JSON for config files
- `ProjectConfig` is stored at `<repo>/.openskulls/config.toml`; `GlobalConfig` is stored in the user's home config dir
- After a schema change, update the init flow in `src/cli/commands/init.ts` if the new field should be collected from the user during `openskulls init`
- Validate loaded config with `ProjectConfigSchema.parse()` at read time — surface Zod errors as actionable messages via `fatal()`

## Key Files

- `src/core/config/types.ts` — `ProjectConfigSchema`, `GlobalConfigSchema`, inferred types
- `src/cli/commands/init.ts` — Collects user input and writes initial `config.toml`
- `src/cli/commands/sync.ts` — Reads config to determine sync behaviour
- `src/cli/ui/console.ts` — `fatal()` for config parse errors

## Anti-Patterns

- Do not add required fields without `.default()` — breaks all existing installations silently
- Do not read `config.toml` with `JSON.parse` — use `smol-toml` exclusively
- Do not store secrets or tokens in `ProjectConfig` — that file is typically checked into source control
- Do not duplicate config fields between `ProjectConfig` and `GlobalConfig` — decide ownership at design time

## Checklist

- [ ] New field added to the correct schema in `src/core/config/types.ts` with `.optional()` or `.default()`
- [ ] `init.ts` updated if the field should be prompted during `openskulls init`
- [ ] `sync.ts` updated if the field affects sync behaviour
- [ ] Backward-compatibility verified: old `config.toml` without the field still parses
- [ ] Unit test added for the schema change
- [ ] `npm test` passes
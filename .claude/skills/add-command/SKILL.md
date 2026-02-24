---
name: add-command
description: >
  Use when adding a new top-level command to the openskulls CLI.
  Triggers: new command, new subcommand, commander, program.command, cli action.
---

# Add a CLI Command

Reference for adding new commands to the openskulls CLI following the commander + shared-writer pattern.

## Core Rules

- Register the command in `src/cli/index.ts` using `program.command()`
- Implement the handler in a new file at `src/cli/commands/<name>.ts`
- All file writes must go through `writeGeneratedFile()` from `src/cli/commands/shared.ts` — never use `fs` directly in a command
- Use `spinner()` from `src/cli/ui/console.ts` for async operations
- Use `log.info`, `log.success`, `log.warn`, `fatal()` for all user-facing output — no `console.log`
- Load and validate config with Zod schemas from `src/core/config/types.ts` before proceeding
- Keep command files thin: delegate logic to core modules, not inline in the action handler

## Key Files

- `src/cli/index.ts` — Commander program setup, command registration
- `src/cli/commands/init.ts` — Full example: analyse → signals → plan → confirm → write
- `src/cli/commands/sync.ts` — Example of interactive + hook mode branching
- `src/cli/commands/shared.ts` — `writeGeneratedFile()` shared writer
- `src/cli/ui/console.ts` — `log.*`, `panel()`, `table()`, `spinner()`, `fatal()`

## Anti-Patterns

- Do not call `fs.writeFile` directly from a command — use `writeGeneratedFile()` so dry-run and CI modes work
- Do not put domain logic (analysis, generation, merging) inside the command action callback
- Do not use `process.exit()` directly — use `fatal()` which handles cleanup
- Do not import Node built-ins without `.js` extension on relative imports (NodeNext ESM)

## Checklist

- [ ] Command registered in `src/cli/index.ts`
- [ ] Handler file created at `src/cli/commands/<name>.ts`
- [ ] All output uses `log.*` / `spinner()` from `console.ts`
- [ ] All writes use `writeGeneratedFile()` from `shared.ts`
- [ ] `npm run build` passes with no type errors
- [ ] At least one integration test added under `tests/`
- [ ] `npm test` passes
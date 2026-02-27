---
name: add-command
description: >
  Use when adding a new top-level command to the openskulls CLI.
  Triggers: new command, new subcommand, commander, program.command, argv, CLI action.
---

# Add a CLI Command

Reference for wiring a new top-level command into the openskulls CLI using commander.

## Core Rules

- Command implementation goes in `src/cli/commands/<name>.ts`
- Register in `src/cli/index.ts` — one `.command()` block per command
- Use `log.*`, `panel()`, `spinner()`, `fatal()` from `src/cli/ui/console.ts` — never use `console.log` directly
- All user-visible errors must call `fatal(msg)` which exits with code 1
- Heavy logic belongs in `src/core/` — the command file is orchestration only
- Use `ora` via the `spinner()` wrapper, not directly
- Parse and validate config with `ProjectConfig` / `GlobalConfig` Zod schemas from `src/core/config/types.ts`

## Pattern

```typescript
// src/cli/commands/mycommand.ts
import { log, spinner, fatal } from '../ui/console.js'

export async function runMyCommand(opts: { flag: boolean }): Promise<void> {
  const spin = spinner('Doing work...')
  try {
    spin.start()
    // delegate to src/core/
    spin.succeed('Done')
  } catch (err) {
    spin.fail('Failed')
    fatal(err instanceof Error ? err.message : String(err))
  }
}
```

```typescript
// src/cli/index.ts — add inside program setup
program
  .command('mycommand')
  .description('What it does')
  .option('--flag', 'description')
  .action(async (opts) => { await runMyCommand(opts) })
```

## Anti-Patterns

- Do not import `process.exit` directly — use `fatal()`
- Do not put fingerprint/generator/config logic inside the command file
- Do not use `console.log` or `console.error` — always use `log.*` helpers
- Do not catch errors silently — always surface them via `fatal()` or `spin.fail()`

## Checklist

- [ ] Command file created at `src/cli/commands/<name>.ts`
- [ ] Registered in `src/cli/index.ts` with `.command()` and `.action()`
- [ ] Uses `log.*` / `spinner()` / `fatal()` from `src/cli/ui/console.ts`
- [ ] Heavy logic delegated to `src/core/`
- [ ] Test file created at `tests/<name>.test.ts`
- [ ] `npm test` passes
- [ ] README.md updated with new command docs
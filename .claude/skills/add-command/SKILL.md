---
name: add-command
description: >
  Use when adding a new top-level command to the openskulls CLI.
  Triggers: new command, new subcommand, commander, program.command, argv, CLI action.
---

# Add a CLI Command

Reference for wiring a new command into the openskulls CLI following Commander conventions.

## Core Rules

- Command logic lives in `src/cli/commands/<name>.ts`; register the command in `src/cli/index.ts`
- Every command must be registered with `.command()`, `.description()`, and an `.action()` handler
- All user-facing output goes through `src/cli/ui/console.ts` — never use `console.log` directly
- Use `ora` spinners for async operations via `spinner()` from `src/cli/ui/console.ts`
- File writes are handled by `writeGeneratedFile()` from `src/cli/commands/shared.ts`
- Fatal errors must call `fatal()` from `src/cli/ui/console.ts` and exit non-zero
- Commands that produce files must support a dry-run path without I/O side effects

## Pattern

```typescript
// src/cli/commands/mycommand.ts
import { Command } from 'commander'
import { log, spinner, fatal } from '../ui/console.js'

export function registerMyCommand(program: Command): void {
  program
    .command('mycommand')
    .description('Short description')
    .option('--dry-run', 'Preview without writing')
    .action(async (opts) => {
      const spin = spinner('Doing thing...')
      try {
        spin.start()
        // logic here
        spin.succeed('Done')
      } catch (err) {
        spin.fail('Failed')
        fatal(err instanceof Error ? err.message : String(err))
      }
    })
}
```

```typescript
// src/cli/index.ts — add registration call
import { registerMyCommand } from './commands/mycommand.js'
registerMyCommand(program)
```

## Anti-Patterns

- Do not put generator or analysis logic inside the command file — delegate to `src/core/`
- Do not call `process.exit()` directly — use `fatal()` which handles logging and exit
- Do not write files from generators — generators return `GeneratedFile[]`, write via `writeGeneratedFile()`

## Checklist

- [ ] Command file created in `src/cli/commands/<name>.ts`
- [ ] Command registered in `src/cli/index.ts`
- [ ] All output uses `log.*` / `spinner()` from `console.ts`
- [ ] Errors handled with `fatal()`
- [ ] Test added under `tests/`
- [ ] `npm test` passes
- [ ] README.md updated with new command
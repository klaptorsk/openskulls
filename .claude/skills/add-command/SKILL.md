---
name: add-command
description: >
  Use when adding a new top-level command to the openskulls CLI.
  Triggers: new command, new subcommand, commander, program.command, argv, CLI action.
---

# Add a New CLI Command

Reference for adding new top-level commands to the openskulls CLI following the commander + UI patterns.

## Core Rules

- All command implementations live in `src/cli/commands/<name>.ts`
- Register commands in `src/cli/index.ts` using `program.command()`
- Never write files directly in a command — use `writeGeneratedFile()` from `src/cli/commands/shared.ts`
- Use `log.*`, `panel()`, `spinner()`, and `fatal()` from `src/cli/ui/console.ts` for all output
- Never call `process.exit()` outside of `fatal()` — `fatal()` calls it internally
- All async actions must be wrapped in a try/catch; call `fatal(err)` on unhandled errors
- Export a single named `register<Name>Command(program: Command): void` function

## Pattern

```typescript
// src/cli/commands/audit.ts
import { Command } from 'commander'
import { log, spinner } from '../ui/console.js'

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Check for dependency drift')
    .action(async () => {
      const spin = spinner('Auditing...')
      spin.start()
      // ... implementation
      spin.succeed('Done')
    })
}

// src/cli/index.ts — add:
import { registerAuditCommand } from './commands/audit.js'
registerAuditCommand(program)
```

## Anti-Patterns

- Do not import Node fs directly in commands for writing output files — always go through `writeGeneratedFile()`
- Do not use `console.log` — use `log.info`, `log.success`, `log.warn`, `log.error`
- Do not swallow errors silently — always surface them with `fatal()` or a warning log

## Checklist

- [ ] Command file created at `src/cli/commands/<name>.ts`
- [ ] `register<Name>Command` exported and called in `src/cli/index.ts`
- [ ] All output goes through `src/cli/ui/console.ts` helpers
- [ ] Error handling calls `fatal()` on unrecoverable errors
- [ ] Test file added at `tests/<name>.test.ts`
- [ ] `npm test` passes
- [ ] README.md updated with new command docs
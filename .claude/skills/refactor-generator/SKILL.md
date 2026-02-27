---
name: refactor-generator
description: >
  Use when extracting shared logic from generators, consolidating helpers, or restructuring generator output.
  Triggers: generator refactor, shared helper, GeneratedFile[], generator registry, DRY, consolidate generators.
---

# Refactor a Generator

Reference for safely refactoring generator code while preserving the no-I/O contract.

## Core Rules

- The no-I/O rule is inviolable: generators return `GeneratedFile[]` and never touch the filesystem
- Shared logic between generators belongs in `src/core/generators/shared.ts` — not duplicated in each generator
- `repoFile()` and `personalFile()` from `src/core/generators/base.ts` must be used for all output entries
- `mergeSections()` from `src/core/generators/merge.ts` handles section-tagged file merges — do not reimplement
- After refactoring, verify both `src/cli/commands/init.ts` and `src/cli/commands/sync.ts` still instantiate generators correctly
- Generator constructor signatures are public API — avoid breaking changes unless both callers are updated

## Key Files

```
src/core/generators/base.ts       — GeneratedFile, BaseGenerator, repoFile(), personalFile()
src/core/generators/shared.ts     — STYLE_LABELS, isConventionalCommits(), buildWorkflowRuleLines()
src/core/generators/merge.ts      — mergeSections(), parseChunks(), extractSections()
src/core/generators/claude-code.ts — primary reference generator
src/core/generators/copilot.ts    — CopilotGenerator
src/core/generators/codex.ts      — CodexGenerator
src/cli/commands/init.ts          — consumes generators
src/cli/commands/sync.ts          — consumes generators
```

## Anti-Patterns

- Do not add I/O to a generator even temporarily during refactor — breaks dry-run and CI modes
- Do not create a new helper in `shared.ts` for logic used by only one generator — keep it local
- Do not change the shape of `GeneratedFile` — it is consumed directly by `writeGeneratedFile()` in `src/cli/commands/shared.ts`
- Do not split a generator into multiple classes unless there is a clear abstraction boundary

## Checklist

- [ ] Extracted logic placed in `shared.ts` with clear, pure function signatures
- [ ] All generators still return valid `GeneratedFile[]` from `generate()`
- [ ] `src/cli/commands/init.ts` and `sync.ts` updated if constructor changed
- [ ] No new I/O introduced in any generator
- [ ] Existing generator tests still pass without modification
- [ ] New unit tests added for any extracted helpers
- [ ] `npm test` passes
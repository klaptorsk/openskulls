---
name: add-generator
description: >
  Use when adding a new generator that emits files into the user's repo.
  Triggers: new generator, GeneratedFile, repoFile, personalFile, Handlebars template, generated output file.
---

# Add a Generator

Reference for implementing a new file generator that follows the no-I/O contract.

## Core Rules

- Generators MUST return `GeneratedFile[]` — never write files directly
- Extend `BaseGenerator` from `src/core/generators/base.ts`
- Use `repoFile(relativePath, content)` for files committed to the repo
- Use `personalFile(relativePath, content)` for user-local files (gitignored)
- Accept `RepoFingerprint` (from `src/core/fingerprint/types.ts`) as constructor or method input
- Use `mergeSections()` from `src/core/generators/merge.ts` when emitting files with tagged sections
- Register the generator in both `src/cli/commands/init.ts` and `src/cli/commands/sync.ts`
- Shared formatting helpers go in `src/core/generators/shared.ts`

## Key Files

```
src/core/generators/base.ts       — GeneratedFile, BaseGenerator, repoFile(), personalFile()
src/core/generators/claude-code.ts — ClaudeCodeGenerator (reference implementation)
src/core/generators/merge.ts       — mergeSections() for tagged-section files
src/core/generators/shared.ts      — STYLE_LABELS, isConventionalCommits(), buildWorkflowRuleLines()
src/cli/commands/init.ts            — instantiates generators, calls generate(), writes files
src/cli/commands/sync.ts            — same pattern for sync flow
```

## Anti-Patterns

- Do not call `fs.writeFile` or any I/O inside a generator — return `GeneratedFile[]` only
- Do not hardcode repo paths — use `repoFile()` / `personalFile()` helpers
- Do not duplicate template rendering logic — use Handlebars templates in `templates/`
- Do not add generator-specific logic to `shared.ts` — keep it truly shared

## Checklist

- [ ] Generator class created at `src/core/generators/<name>.ts` extending `BaseGenerator`
- [ ] `generate()` returns `GeneratedFile[]` with no side effects
- [ ] `repoFile()` / `personalFile()` used for all output files
- [ ] Handlebars template added to `templates/` if needed
- [ ] Generator instantiated in `src/cli/commands/init.ts`
- [ ] Generator instantiated in `src/cli/commands/sync.ts`
- [ ] Unit tests written in `tests/generators/<name>.test.ts`
- [ ] `npm test` passes
- [ ] README.md updated
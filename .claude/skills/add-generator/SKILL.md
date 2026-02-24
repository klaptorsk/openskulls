---
name: add-generator
description: >
  Use when adding a new generator that produces AI-readable output files.
  Triggers: new generator, GeneratedFile, BaseGenerator, emit file, generate output, template render.
---

# Add a File Generator

Reference for adding generators that produce `GeneratedFile[]` following the no-I/O generator contract.

## Core Rules

- Generators MUST return `GeneratedFile[]` — never call `fs.writeFile` or any I/O inside a generator
- Extend `BaseGenerator` from `src/core/generators/base.ts`
- Use `repoFile(path, content)` for files written to the project repo (e.g. `CLAUDE.md`)
- Use `personalFile(path, content)` for files that go in personal/global config dirs
- Accept a `RepoFingerprint` (from `src/core/fingerprint/types.ts`) as the primary data source
- Use `mergeSections()` from `src/core/generators/merge.ts` when the output file uses tagged sections that must survive re-runs
- Render templates via Handlebars from `templates/<name>/` — keep template logic minimal

## Key Files

- `src/core/generators/base.ts` — `GeneratedFile`, `BaseGenerator`, `repoFile()`, `personalFile()`
- `src/core/generators/claude-code.ts` — Full example: CLAUDE.md + skills + settings output
- `src/core/generators/merge.ts` — `mergeSections()`, `parseChunks()`, `extractSections()`
- `src/core/fingerprint/types.ts` — `RepoFingerprint` Zod schema (generator input)
- `templates/claude-code/CLAUDE.md.hbs` — Handlebars template example with tagged sections

## Anti-Patterns

- Do not write files inside a generator — the CLI layer owns all I/O via `writeGeneratedFile()`
- Do not access `process.cwd()` or environment variables inside a generator — accept paths via constructor
- Do not use conditional logic inside Handlebars templates; compute derived values in TypeScript before passing to the template context
- Do not skip `mergeSections()` for files with `<!-- openskulls:section: -->` tags — user edits outside tagged sections must be preserved

## Checklist

- [ ] Generator extends `BaseGenerator` and returns `GeneratedFile[]`
- [ ] No `fs` imports inside the generator file
- [ ] Template added to `templates/<name>/` if Handlebars is used
- [ ] Generator instantiated and called inside the relevant command (`init.ts` or `sync.ts`)
- [ ] `mergeSections()` used if output file has tagged sections
- [ ] Unit tests added under `tests/generators/`
- [ ] `npm test` passes
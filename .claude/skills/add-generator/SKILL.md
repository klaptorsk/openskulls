---
name: add-generator
description: >
  Use when adding a new generator that emits files into the user's repo.
  Triggers: new generator, GeneratedFile, repoFile, personalFile, Handlebars template, generated output file.
---

# Add a File Generator

Reference for creating a new generator that follows the no-I/O `GeneratedFile[]` return convention.

## Core Rules

- Generators extend `BaseGenerator` from `src/core/generators/base.ts`
- Generators MUST return `GeneratedFile[]` — zero file writes, zero side effects
- Use `repoFile(path, content)` for files committed to the repo; `personalFile(path, content)` for user-local files
- Accept `RepoFingerprint` (from `src/core/fingerprint/types.ts`) as the data source — never scan the filesystem
- Handlebars templates live in `templates/` and are loaded at runtime
- If a file supports section merging, set `merge_sections: true` on the `GeneratedFile`
- Validate all inputs with Zod before rendering

## Key Files

| File | Purpose |
|---|---|
| `src/core/generators/base.ts` | `BaseGenerator`, `GeneratedFile`, `repoFile()`, `personalFile()` |
| `src/core/generators/claude-code.ts` | Reference implementation — CLAUDE.md + skills |
| `src/core/generators/merge.ts` | `mergeSections()` for section-aware merging |
| `templates/claude-code/CLAUDE.md.hbs` | Handlebars template example |
| `src/core/fingerprint/types.ts` | `RepoFingerprint` Zod schema |

## Pattern

```typescript
// src/core/generators/my-generator.ts
import { BaseGenerator, GeneratedFile, repoFile } from './base.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import Handlebars from 'handlebars'
import { readFileSync } from 'fs'

export class MyGenerator extends BaseGenerator {
  generate(fingerprint: RepoFingerprint): GeneratedFile[] {
    const tpl = Handlebars.compile(readFileSync('templates/my/file.hbs', 'utf8'))
    return [
      repoFile('.my-output/file.md', tpl({ fingerprint }))
    ]
  }
}
```

## Anti-Patterns

- Do not call `fs.writeFileSync` or any I/O inside a generator — callers own the write step
- Do not hardcode file content as strings inline when a template would be cleaner
- Do not accept raw filesystem paths as input — use the fingerprint data model

## Checklist

- [ ] Generator extends `BaseGenerator` and returns `GeneratedFile[]`
- [ ] Template added to `templates/` if Handlebars is used
- [ ] Registered and called from the relevant CLI command
- [ ] Unit test covers the returned file paths and content
- [ ] `npm test` passes
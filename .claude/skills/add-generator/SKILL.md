---
name: add-generator
description: >
  Use when adding a new generator that emits files into the user's repo.
  Triggers: new generator, GeneratedFile, repoFile, personalFile, Handlebars template, generated output file.
---

# Add a New Generator

Reference for implementing a new file generator following the no-I/O, GeneratedFile[] pattern.

## Core Rules

- Generators extend `BaseGenerator` from `src/core/generators/base.ts`
- Generator methods return `GeneratedFile[]` — NEVER write to disk
- Use `repoFile(path, content)` for files that should be committed to the repo
- Use `personalFile(path, content)` for files that should be gitignored
- Implement `generate(fingerprint: RepoFingerprint): GeneratedFile[]`
- Handlebars templates live in `templates/<generator-name>/`
- Load templates via `fs.readFileSync` at call time — do not cache at module level in tests
- Shared rendering helpers belong in `src/core/generators/shared.ts`

## Key Files

```
src/core/generators/base.ts        — BaseGenerator, GeneratedFile, repoFile(), personalFile()
src/core/generators/claude-code.ts — ClaudeCodeGenerator (reference implementation)
src/core/generators/copilot.ts    — CopilotGenerator (simpler reference)
src/core/generators/shared.ts     — STYLE_LABELS, buildWorkflowRuleLines(), isConventionalCommits()
templates/claude-code/             — Handlebars templates for ClaudeCodeGenerator
```

## Pattern

```typescript
// src/core/generators/myengine.ts
import { BaseGenerator, GeneratedFile, repoFile } from './base.js'
import type { RepoFingerprint } from '../fingerprint/types.js'
import Handlebars from 'handlebars'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class MyEngineGenerator extends BaseGenerator {
  generate(fingerprint: RepoFingerprint): GeneratedFile[] {
    const tplPath = join(__dirname, '../../../templates/myengine/FILE.hbs')
    const template = Handlebars.compile(readFileSync(tplPath, 'utf8'))
    const content = template({ fingerprint })
    return [repoFile('MY_ENGINE_FILE.md', content)]
  }
}
```

## Anti-Patterns

- Do not call `fs.writeFileSync` inside a generator — only the CLI layer writes
- Do not throw from `generate()` for missing optional fields — use safe defaults
- Do not hardcode strings that belong in a Handlebars template

## Checklist

- [ ] Generator class created in `src/core/generators/<name>.ts`
- [ ] Handlebars template added to `templates/<name>/`
- [ ] Generator instantiated and called in `src/cli/commands/init.ts` and `sync.ts`
- [ ] Unit test covers at least the happy-path output
- [ ] `npm test` passes
- [ ] README.md updated
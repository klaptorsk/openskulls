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
- Implement `generate(input: GeneratorInput): GeneratedFile[]` — input contains fingerprint, aiSkills, workflowConfig, userAnswers, architectGuardrails, workspaceMap, and foreignSkills
- Register the generator in `src/core/generators/registry.ts` — do NOT wire directly into init/sync
- Handlebars templates live in `templates/<generator-name>/`
- Shared rendering helpers belong in `src/core/generators/shared.ts`

## GeneratorInput Shape

```typescript
interface GeneratorInput {
  fingerprint: RepoFingerprint
  aiSkills?: AISkill[]                    // may be empty if target doesn't use skills
  workflowConfig: WorkflowConfig
  userAnswers?: Record<string, string>
  architectGuardrails?: ArchitectGuardrails  // module ownership, layer rules, forbidden patterns
  workspaceMap?: WorkspaceMapEntry[]         // monorepo workspace summaries
  foreignSkills?: ForeignSkill[]             // skills from existing AI instruction files
}
```

## Key Files

```
src/core/generators/base.ts                  — BaseGenerator, GeneratedFile, GeneratorInput, repoFile(), personalFile()
src/core/generators/registry.ts              — getBuiltinGenerators(), selectGenerators() — register here
src/core/generators/claude-code.ts           — ClaudeCodeGenerator (full reference: skills, workspace map, guardrails)
src/core/generators/copilot.ts               — CopilotGenerator (simpler reference, no skills)
src/core/generators/cursor.ts                — CursorGenerator (YAML frontmatter + alwaysApply rule format)
src/core/generators/shared.ts                — STYLE_LABELS, buildWorkflowRuleLines(), isConventionalCommits()
src/core/generators/workspace-aggregate.ts   — buildWorkspaceMapSection() — shared workspace table builder
templates/                                    — add templates/<generator>/ here
```

## Pattern

```typescript
// src/core/generators/myengine.ts
import { BaseGenerator, type GeneratorInput, type GeneratedFile, repoFile } from './base.js'

export class MyEngineGenerator extends BaseGenerator {
  readonly toolId = 'myengine'

  generate(input: GeneratorInput): GeneratedFile[] {
    const { fingerprint, aiSkills, architectGuardrails, workspaceMap } = input
    const lines: string[] = []

    // Build content using fingerprint data
    lines.push(`# ${fingerprint.repoName}`)

    // Include workspace map if monorepo
    if (workspaceMap && workspaceMap.length > 0) {
      lines.push(buildWorkspaceMapSection(workspaceMap))
    }

    // Include guardrails if generated
    if (architectGuardrails) {
      lines.push(buildGuardrailsSection(architectGuardrails))
    }

    return [repoFile('.myengine/instructions.md', lines.join('\n'), 'merge_sections')]
  }
}

// src/core/generators/registry.ts — register it
import { MyEngineGenerator } from './myengine.js'
// Add to getBuiltinGenerators() array
```

## Anti-Patterns

- Do not call `fs.writeFileSync` inside a generator — only the CLI layer writes
- Do not throw from `generate()` for missing optional fields — use safe defaults
- Do not hardcode strings that belong in a Handlebars template
- Do not wire generators directly into init.ts/sync.ts — use the registry

## Checklist

- [ ] Generator class created in `src/core/generators/<name>.ts` with `toolId`
- [ ] Generator registered in `src/core/generators/registry.ts`
- [ ] Handlebars template added to `templates/<name>/` (if using templates)
- [ ] Handles optional `workspaceMap` and `architectGuardrails` inputs
- [ ] Unit test covers at least the happy-path output
- [ ] `bun test` passes
- [ ] README.md updated

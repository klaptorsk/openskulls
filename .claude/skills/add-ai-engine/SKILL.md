---
name: add-ai-engine
description: >
  Use when adding support for a new AI coding CLI engine to openskulls.
  Triggers: new AI tool, new engine, new generator, AICLIAdapter, AI_CLI_CANDIDATES, detectAICLIs, AICLISignal, ENGINE_TO_TOOL, ALL_TARGETS, AGENTS.md, cursor, windsurf, cline.
---

# Add Support for a New AI Engine

Reference for wiring a new AI coding tool (e.g. Cursor, Windsurf, Cline) into openskulls end-to-end.

## Core Rules

- CLI detection: add the binary name to `AI_CLI_CANDIDATES` in `src/core/fingerprint/ai-collector.ts`
- Presence signals: add repo-level signal files (e.g. `.cursor/`, `.windsurfrules`) to `AICLISignal` detection logic
- Generator: create `src/core/generators/<engine>.ts` extending `BaseGenerator`
- Engine-to-generator mapping lives in the init/sync command — wire it there
- Template: create `templates/<engine>/` with the engine-specific instructions file
- The generator must follow the no-I/O contract: return `GeneratedFile[]`, never write
- Use `repoFile()` for files that should be committed, `personalFile()` for gitignored files

## Key Files

```
src/core/fingerprint/ai-collector.ts  — AI_CLI_CANDIDATES, detectAICLIs(), AICLISignal
src/core/generators/copilot.ts        — simple reference generator (Copilot)
src/core/generators/codex.ts          — AGENTS.md generator (Codex)
src/cli/commands/init.ts              — engine selection + generator instantiation
src/cli/commands/sync.ts              — sync flow, same generator wiring
templates/                            — add templates/<engine>/ here
```

## Pattern

```typescript
// 1. src/core/fingerprint/ai-collector.ts
export const AI_CLI_CANDIDATES = [
  // ... existing ...
  { id: 'myengine', binaries: ['myengine', 'me'] },
]

// 2. src/core/generators/myengine.ts
export class MyEngineGenerator extends BaseGenerator {
  generate(fp: RepoFingerprint): GeneratedFile[] {
    const tpl = Handlebars.compile(readFileSync(tplPath, 'utf8'))
    return [repoFile('.myengine/instructions.md', tpl({ fp }))]
  }
}

// 3. Wire in src/cli/commands/init.ts
if (detectedEngines.includes('myengine')) {
  generators.push(new MyEngineGenerator())
}
```

## Anti-Patterns

- Do not hardcode file paths in the generator class — load from `templates/` at call time
- Do not add the new engine to init only — sync must also emit the file
- Do not call the AI pipeline again per engine — one AI call per `openskulls init` run

## Checklist

- [ ] Binary added to `AI_CLI_CANDIDATES`
- [ ] Repo presence signals added to detection logic
- [ ] Generator class created in `src/core/generators/<engine>.ts`
- [ ] Template created in `templates/<engine>/`
- [ ] Generator wired into both `init.ts` and `sync.ts`
- [ ] Unit test for generator output
- [ ] `npm test` passes
- [ ] README.md updated with new engine support
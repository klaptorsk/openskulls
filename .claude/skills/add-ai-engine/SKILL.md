---
name: add-ai-engine
description: >
  Use when adding support for a new AI coding CLI engine to openskulls.
  Triggers: new AI tool, new engine, new generator, AICLIAdapter, AI_CLI_CANDIDATES, detectAICLIs, AICLISignal, ENGINE_TO_TOOL, ALL_TARGETS, AGENTS.md, cursor, windsurf, cline.
---

# Add Support for a New AI Engine

Reference for wiring a new AI coding tool (e.g. Windsurf, Cline) into openskulls end-to-end.

## Core Rules

- CLI detection: add the command to `AI_CLI_CANDIDATES` in `src/core/fingerprint/ai-collector.ts` with the correct `invoke` mode (`'stdin'` or `'arg'`)
- Presence signals: add repo-level signal files (e.g. `.windsurf/`, custom config) to `detectAICLIs()` detection logic
- Generator: create `src/core/generators/<engine>.ts` extending `BaseGenerator`
- Register the generator in `src/core/generators/registry.ts` — add to `getBuiltinGenerators()` with the matching toolId
- Template: create `templates/<engine>/` with the engine-specific instructions file
- The generator must follow the no-I/O contract: return `GeneratedFile[]`, never write
- Use `repoFile()` for committed files, `personalFile()` for gitignored files
- Add the tool to `ALL_TARGETS` in `src/cli/commands/init.ts` and to the `askAITool()` selector
- Add the tool to `SKILL_TARGETS` set in init.ts/sync.ts if the engine supports skills (slash commands)

## AICLIAdapter Interface

```typescript
interface AICLIAdapter {
  command: string                    // binary name (e.g. 'myengine', 'myengine.cmd')
  invoke: 'stdin' | 'arg'           // 'stdin': prompt piped to child.stdin; 'arg': passed as -p argument
  version?: string                   // detected version string
  shell?: boolean | 'powershell'    // how to spawn: false (direct), true (shell), 'powershell' (Windows)
}
```

- `stdin` mode: best for long prompts (no ARG_MAX limit), used by Claude
- `arg` mode: simpler, used by Copilot and Codex; on Windows, prompt read from temp file via PowerShell variable
- `shell` is auto-detected by `trySpawnVersion()` — tries direct → shell → powershell

## Key Files

```
src/core/fingerprint/ai-collector.ts    — AI_CLI_CANDIDATES, AICLIAdapter, detectAICLI(), detectAICLIs(), invokeAICLI()
src/core/generators/registry.ts         — getBuiltinGenerators(), selectGenerators() — register new generator here
src/core/generators/copilot.ts          — simple reference generator (arg mode engine)
src/core/generators/cursor.ts           — Cursor reference (.cursor/rules/project.mdc)
src/cli/commands/init.ts                — ALL_TARGETS, askAITool(), SKILL_TARGETS, needsSkills gating
src/cli/commands/sync.ts                — SKILL_TARGETS, loadEnabledTargets()
templates/                              — add templates/<engine>/ here
```

## Pattern

```typescript
// 1. src/core/fingerprint/ai-collector.ts — add to candidates
const AI_CLI_CANDIDATES: AICLIAdapter[] = [
  { command: 'claude',    invoke: 'stdin' },
  { command: 'codex',     invoke: 'arg'   },
  { command: 'copilot',   invoke: 'arg'   },
  { command: 'myengine',  invoke: 'arg'   },  // ← new
]

// 2. src/core/generators/myengine.ts — create generator
export class MyEngineGenerator extends BaseGenerator {
  readonly toolId = 'myengine'
  generate(input: GeneratorInput): GeneratedFile[] { ... }
}

// 3. src/core/generators/registry.ts — register it
import { MyEngineGenerator } from './myengine.js'
export function getBuiltinGenerators(): BaseGenerator[] {
  return [
    new ClaudeCodeGenerator(),
    new CopilotGenerator(),
    new CodexGenerator(),
    new CursorGenerator(),
    new MyEngineGenerator(),  // ← new
  ]
}
```

## Anti-Patterns

- Do not hardcode file paths in the generator class — load from `templates/` at call time
- Do not wire generators directly into init/sync — add to the registry, which handles selection
- Do not call the AI pipeline again per engine — one AI call per `openskulls init` run
- Do not assume stdin works on Windows .cmd wrappers — use `invoke: 'arg'` for npm-installed CLIs

## Checklist

- [ ] Command added to `AI_CLI_CANDIDATES` with correct `invoke` mode
- [ ] Repo presence signals added to `detectAICLIs()` detection logic
- [ ] Generator class created in `src/core/generators/<engine>.ts` with `toolId`
- [ ] Generator registered in `src/core/generators/registry.ts`
- [ ] Template created in `templates/<engine>/`
- [ ] Tool added to `ALL_TARGETS` and `askAITool()` in init.ts
- [ ] Tool added to `SKILL_TARGETS` if it supports skills
- [ ] `TOOL_TO_CLI` mapping added in ai-collector.ts
- [ ] Unit test for generator output
- [ ] `bun test` passes
- [ ] README.md updated with new engine support

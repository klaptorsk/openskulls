---
name: add-ai-engine
description: >
  Use when adding support for a new AI coding CLI engine to openskulls.
  Covers CLI detection, repo-presence signals, generator implementation, and init wiring.
  Triggers: new AI tool, new engine, new generator, AICLIAdapter, AI_CLI_CANDIDATES,
  detectAICLIs, AICLISignal, ENGINE_TO_TOOL, ALL_TARGETS, AGENTS.md, cursor, windsurf, cline.
---

# Add a New AI Engine

Reference for wiring a new AI coding CLI into openskulls end-to-end: detection, repo signals, generator, and init plumbing. Touch these 5 files in order.

## Core Rules

- `AI_CLI_CANDIDATES` drives PATH detection — add the binary name and its invoke style (`stdin` or `arg`)
- `AICLISignal.tool` is a Zod enum — every new tool ID must be added there or Zod will reject it at runtime
- `detectAICLIs()` handles repo-presence detection (config files, directories) — separate from PATH detection
- Generators extend `BaseGenerator`, return `GeneratedFile[]` only, never write to disk
- `ENGINE_TO_TOOL` in `init.ts` maps binary name → tool ID; must be kept in sync with `AI_CLI_CANDIDATES`
- `ALL_TARGETS` in `init.ts` must include the new tool ID or it won't appear in `config.toml`

## Key Files

| File | What to change |
|------|---------------|
| `src/core/fingerprint/types.ts` | Extend `AICLISignal.tool` enum with new tool ID |
| `src/core/fingerprint/ai-collector.ts` | Add to `AI_CLI_CANDIDATES`; add block in `detectAICLIs()` |
| `src/core/generators/<toolname>.ts` | New generator — create this file |
| `src/cli/commands/init.ts` | `CLI_NAMES`, `ENGINE_TO_TOOL`, generator selection block, `ALL_TARGETS` |

## Pattern

### Step 1 — Extend the AICLISignal enum (`src/core/fingerprint/types.ts`)

```typescript
// Before
export const AICLISignal = z.object({
  tool: z.enum(['claude_code', 'copilot', 'cursor']),
  ...
})

// After — add the new tool ID in snake_case
export const AICLISignal = z.object({
  tool: z.enum(['claude_code', 'copilot', 'cursor', 'my_tool']),
  ...
})
```

---

### Step 2 — Add CLI to `AI_CLI_CANDIDATES` (`src/core/fingerprint/ai-collector.ts`)

```typescript
const AI_CLI_CANDIDATES: AICLIAdapter[] = [
  { command: 'claude',   invoke: 'stdin' },
  { command: 'codex',    invoke: 'arg'   },
  { command: 'copilot',  invoke: 'arg'   },
  { command: 'my-tool',  invoke: 'arg'   },  // ← add here, in priority order
]
```

- `invoke: 'stdin'` — prompt is written to child.stdin (`my-tool -p -`)
- `invoke: 'arg'`   — prompt is the `-p` argument (`my-tool -p "..."`)

Then add a detection block in `detectAICLIs()` (further down in the same file):

```typescript
// my-tool — .my-tool-rules or .my-tool/ directory
{
  const evidence: string[] = []
  if (configFiles.has('.my-tool-rules')) evidence.push('.my-tool-rules found')
  if (fileTree.some((f) => f.startsWith('.my-tool/'))) evidence.push('.my-tool/ directory found')
  if (evidence.length > 0) signals.push({ tool: 'my_tool', confidence: 'high', evidence })
}
```

Also add the config filenames to `KNOWN_CONFIG_FILES` if they should be read for the AI prompt:

```typescript
const KNOWN_CONFIG_FILES = new Set([
  // ... existing entries ...
  '.my-tool-rules',   // ← add if the tool uses a rules/config file
])
```

---

### Step 3 — Create the generator (`src/core/generators/my-tool.ts`)

Model after `src/core/generators/copilot.ts` (simple markdown) or `src/core/generators/claude-code.ts` (directory structure with skills).

```typescript
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'
import { STYLE_LABELS, isConventionalCommits, buildWorkflowRuleLines } from './shared.js'

export class MyToolGenerator extends BaseGenerator {
  readonly toolId = 'my_tool'
  readonly toolName = 'My Tool'
  override readonly detectionFiles = ['.my-tool-rules'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    // Build content from input.fingerprint, input.workflowConfig, input.aiSkills
    const content = buildMyToolInstructions(input.fingerprint, input.workflowConfig)
    // Use the path the tool actually reads — check the tool's docs
    return [repoFile('.my-tool-rules', content, 'merge_sections')]
  }
}
```

Tool-to-output-path reference:

| Tool | Output file / directory |
|------|------------------------|
| Claude Code | `CLAUDE.md`, `.claude/commands/`, `.claude/skills/`, `.claude/settings.json` |
| Codex | `AGENTS.md` |
| Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/<name>.mdc` (new) or `.cursorrules` (legacy) |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |

---

### Step 4 — Wire into `init.ts` (`src/cli/commands/init.ts`)

Four places:

```typescript
// 1. Import the generator
import { MyToolGenerator } from '../../core/generators/my-tool.js'

// 2. CLI_NAMES display map (Step 0)
const CLI_NAMES: Record<string, string> = {
  claude:   'Claude Code',
  codex:    'Codex',
  copilot:  'GitHub Copilot',
  'my-tool': 'My Tool',   // ← add
}

// 3. ENGINE_TO_TOOL map (Step 7)
const ENGINE_TO_TOOL: Record<string, string> = {
  claude:   'claude_code',
  codex:    'codex',
  copilot:  'copilot',
  'my-tool': 'my_tool',   // ← add
}

// 4. Generator selection block (Step 7)
if (toolsToGenerate.has('my_tool')) {
  generatedFiles.push(...new MyToolGenerator().generate(generatorInput))
}

// 5. ALL_TARGETS in saveConfig()
const ALL_TARGETS = ['claude_code', 'codex', 'copilot', 'my_tool'] as const  // ← add
```

## Anti-Patterns

- Do not skip Step 1 — if the tool ID isn't in the Zod enum, `detectAICLIs()` will throw a Zod validation error at runtime
- Do not hardcode generator invocation — always use the `toolsToGenerate` set so both "engine in use" and "tool detected in repo" are covered
- Do not copy the full generator signature from `add-generator` skill — `GeneratorInput` already provides everything; don't re-derive fingerprint data from disk

## Checklist

- [ ] `AICLISignal.tool` enum extended in `types.ts`
- [ ] Binary added to `AI_CLI_CANDIDATES` with correct `invoke` style
- [ ] Config filenames added to `KNOWN_CONFIG_FILES` if applicable
- [ ] Detection block added to `detectAICLIs()` with the right file/directory checks
- [ ] Generator file created at `src/core/generators/<toolname>.ts`
- [ ] Generator extends `BaseGenerator`, returns `GeneratedFile[]`, correct output path
- [ ] `CLI_NAMES` updated in `init.ts`
- [ ] `ENGINE_TO_TOOL` updated in `init.ts`
- [ ] Generator wired into selection block in `init.ts`
- [ ] Tool added to `ALL_TARGETS` in `saveConfig`
- [ ] Test added under `tests/generators/<toolname>.test.ts`
- [ ] `npm test` passes

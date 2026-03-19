---
name: debug-ai-pipeline
description: >
  Use when the AI fingerprint collection or skills generation is failing, producing bad JSON, or timing out.
  Triggers: claude -p, AIFingerprintCollector, invokeAICLI, stripJsonFences, Zod parse error, AI response, skills-builder, generateAISkills, normaliseAnalysisResponse, AICLIAdapter, last-error.log, spawnVersion, Windows PowerShell.
---

# Debug the AI Fingerprint Pipeline

Reference for diagnosing failures in the multi-phase AI pipeline: fingerprint analysis, skills generation, methodology, and architect.

## Core Rules

- `AIFingerprintCollector.collect()` is in `src/core/fingerprint/ai-collector.ts` — all AI invocation logic lives here
- `invokeAICLI()` uses `AICLIAdapter` to determine invocation mode: `stdin` (claude) or `arg` (copilot, codex)
- On Windows, `invokeAICLI()` routes through PowerShell with temp-file I/O to bypass .cmd wrapper stdin issues
- `stripJsonFences()` removes ```json fences AND extracts the outermost `{…}` block from natural-language preamble (Copilot-style responses)
- `normaliseAnalysisResponse()` maps non-conforming field names before Zod parse — check this when Copilot/Codex returns different JSON shapes (e.g. `primary_language` → `languages[]`, `architecture.pattern` → `architecture.style`)
- On analysis failure, `.openskulls/last-error.log` is written with full prompt + raw response — check this first
- Both AI calls are non-fatal: failures log a warning and return `null` / partial data
- Skills generation is gated by `needsSkills` — only runs when enabled targets include `claude_code` or `codex`

## Key Files

```
src/core/fingerprint/ai-collector.ts    — AICLIAdapter, invokeAICLI(), normaliseAnalysisResponse(), stripJsonFences(), detectAICLI()
src/core/fingerprint/skills-builder.ts — generateAISkills(), AISkill + AISkillsResponse schemas
src/core/fingerprint/prompt-builder.ts — buildAnalysisPrompt() — check prompt shape here
src/core/fingerprint/skills-prompt.ts  — buildSkillsPrompt() — check skills prompt here
templates/prompts/analysis.md.hbs      — rendered analysis prompt
templates/prompts/skills.md.hbs        — rendered skills prompt
.openskulls/last-error.log             — written on analysis failure (prompt + response + error)
```

## Debugging Steps

```typescript
// 1. Check last-error.log first (written automatically on failure)
// Contains: engine info, error message, full prompt, raw response

// 2. Isolate: run just the prompt builder
const prompt = buildAnalysisPrompt(repoName, fileTree, configContents)

// 3. Test invokeAICLI directly with a known adapter
const adapter = await detectAICLI()  // check adapter.invoke and adapter.shell
const raw = await invokeAICLI(adapter, prompt)

// 4. Test normalisation (handles non-conforming responses)
const json = JSON.parse(stripJsonFences(raw))
const normalised = normaliseAnalysisResponse(json)

// 5. Test Zod parse
const parsed = AIAnalysisResponse.safeParse(normalised)
if (!parsed.success) console.error(parsed.error.format())
```

## Windows-Specific Issues

- `spawnVersion()` tries 3 shell modes: direct → cmd.exe → powershell.exe — rejects on non-zero exit
- `invokeAICLI()` uses async `spawn` (not `spawnSync`) so spinner animations stay alive
- stdin adapters: `Start-Process -RedirectStandardInput` with temp file
- arg adapters: `Get-Content` + PS variable to avoid cmd.exe 8191-char limit
- `Out-File` adds UTF-8 BOM — stripped automatically

## Anti-Patterns

- Do not make AI calls fatal — always catch and return null/partial so the CLI degrades gracefully
- Do not add new required fields to `AIAnalysisResponse` without `.default()` or `.optional()` — old model responses won't include them
- Do not use `spawnSync` on Windows — it blocks the event loop and freezes spinner animations
- Do not assume all AI CLIs return conforming JSON — always run through `normaliseAnalysisResponse()`

## Checklist

- [ ] Check `.openskulls/last-error.log` for prompt and raw response
- [ ] Verify `detectAICLI()` returns the expected adapter (check `command`, `invoke`, `shell`)
- [ ] Raw AI response is valid JSON after `stripJsonFences()`
- [ ] `normaliseAnalysisResponse()` maps non-standard fields correctly
- [ ] Zod schema matches the fields the model is actually returning
- [ ] Test added to reproduce the specific parse/timeout failure
- [ ] `bun test` passes

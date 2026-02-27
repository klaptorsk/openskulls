---
name: debug-ai-pipeline
description: >
  Use when the AI fingerprint collection or skills generation is failing, producing bad JSON, or timing out.
  Triggers: claude -p, AIFingerprintCollector, invokeAICLI, stripJsonFences, Zod parse error, AI response, skills-builder, generateAISkills.
---

# Debug the AI Pipeline

Reference for diagnosing failures in the two-stage AI pipeline: fingerprint analysis and skills generation.

## Core Rules

- The first AI call is `AIFingerprintCollector.collect()` in `src/core/fingerprint/ai-collector.ts` — invokes `claude -p` via stdin
- The second AI call is `generateAISkills()` in `src/core/fingerprint/skills-builder.ts`
- Both calls go through `invokeAICLI(prompt, cliPath)` — check this function first on subprocess errors
- `stripJsonFences()` strips ` ```json ` fences before Zod parse — AI often wraps JSON in fences
- Zod parse errors mean the AI returned a schema mismatch — inspect the raw response before the parse step
- Both AI calls are non-fatal by design — failures return `null` / partial data, not thrown errors
- `detectAICLIs()` checks PATH for `claude`, `cursor`, etc. — if no CLI found, AI calls are skipped entirely

## Key Files

```
src/core/fingerprint/ai-collector.ts   — AIFingerprintCollector, invokeAICLI(), detectAICLI(), stripJsonFences()
src/core/fingerprint/prompt-builder.ts — buildAnalysisPrompt() — inspect prompt sent to AI
src/core/fingerprint/skills-builder.ts — generateAISkills(), AISkillsResponse Zod schema
src/core/fingerprint/skills-prompt.ts  — buildSkillsPrompt() — inspect skills prompt
templates/prompts/analysis.md.hbs       — analysis prompt template
templates/prompts/skills.md.hbs         — skills prompt template
```

## Debugging Steps

1. **Check CLI detection**: call `detectAICLIs()` manually — confirm `claude` is on PATH and executable
2. **Inspect prompt**: call `buildAnalysisPrompt()` or `buildSkillsPrompt()` and print — verify it renders correctly
3. **Test raw AI call**: run `echo "<prompt>" | claude -p -` in terminal — see raw AI output
4. **Check JSON fences**: if Zod fails, log the raw string before `stripJsonFences()` — AI may be wrapping in unexpected fences
5. **Schema mismatch**: compare raw JSON keys against `AIAnalysisResponseSchema` / `AISkillsResponse` in `types.ts`
6. **Timeout**: `invokeAICLI` has no built-in timeout — large file trees can cause slow responses

## Anti-Patterns

- Do not swallow the raw AI response without logging it when debugging — always print before Zod parse
- Do not assume `detectAICLI()` will find the CLI in CI — PATH may differ from local
- Do not change Zod schemas to match bad AI output — fix the prompt instead
- Do not add retries to `invokeAICLI` without a timeout guard

## Checklist

- [ ] `detectAICLIs()` returns expected CLI entries
- [ ] Prompt renders without undefined/null values
- [ ] Raw AI output logged before `stripJsonFences()`
- [ ] `stripJsonFences()` leaves valid JSON
- [ ] Zod parse succeeds against correct schema
- [ ] `npm test` passes including AI pipeline unit tests
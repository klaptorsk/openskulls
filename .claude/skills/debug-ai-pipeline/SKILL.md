---
name: debug-ai-pipeline
description: >
  Use when the AI fingerprint collection or skills generation is failing, producing bad JSON, or timing out.
  Triggers: claude -p, AIFingerprintCollector, invokeAICLI, stripJsonFences, Zod parse error, AI response, skills-builder, generateAISkills.
---

# Debug the AI Fingerprint Pipeline

Reference for diagnosing failures in the two-phase AI pipeline: fingerprint analysis and skills generation.

## Core Rules

- `AIFingerprintCollector.collect()` is in `src/core/fingerprint/ai-collector.ts` — all AI invocation logic lives here
- `invokeAICLI()` writes the prompt to `child.stdin` (not argv) to avoid ARG_MAX limits
- `stripJsonFences()` removes ```json fences before Zod parse — check this first when seeing parse errors
- Both AI calls are non-fatal: failures log a warning and return `null` / partial data
- Skills generation is in `src/core/fingerprint/skills-builder.ts` — `generateAISkills()` is the entry point
- The AI prompt templates are at `templates/prompts/analysis.md.hbs` and `templates/prompts/skills.md.hbs`

## Key Files

```
src/core/fingerprint/ai-collector.ts    — AIFingerprintCollector, invokeAICLI(), stripJsonFences()
src/core/fingerprint/skills-builder.ts — generateAISkills(), AISkill + AISkillsResponse schemas
src/core/fingerprint/prompt-builder.ts — buildAnalysisPrompt() — check prompt shape here
src/core/fingerprint/skills-prompt.ts  — buildSkillsPrompt() — check skills prompt here
templates/prompts/analysis.md.hbs      — rendered analysis prompt
templates/prompts/skills.md.hbs        — rendered skills prompt
```

## Debugging Steps

```typescript
// 1. Isolate: run just the prompt builder
const prompt = buildAnalysisPrompt(repoName, fileTree, configContents)
console.log(prompt) // check the rendered prompt is valid

// 2. Test invokeAICLI directly
const raw = await invokeAICLI(prompt)
console.log(raw) // is it returning JSON? fenced? error text?

// 3. Test stripJsonFences
const stripped = stripJsonFences(raw)
console.log(stripped)

// 4. Test Zod parse
const parsed = AIAnalysisResponseSchema.safeParse(JSON.parse(stripped))
if (!parsed.success) console.error(parsed.error.format())
```

## Anti-Patterns

- Do not make AI calls fatal — always catch and return null/partial so the CLI degrades gracefully
- Do not add new required fields to `AIAnalysisResponseSchema` without `.optional()` — old model responses won't include them
- Do not pass the prompt via argv — always use stdin to avoid shell argument length limits

## Checklist

- [ ] Prompt renders correctly (no missing Handlebars variables)
- [ ] `claude` binary is on PATH and executable (`detectAICLI()` returns a path)
- [ ] Raw AI response is valid JSON after `stripJsonFences()`
- [ ] Zod schema matches the fields the model is actually returning
- [ ] Test added to reproduce the specific parse/timeout failure
- [ ] `npm test` passes
---
name: debug-ai-pipeline
description: >
  Use when the AI fingerprint collection or skills generation is failing, producing bad JSON, or timing out.
  Triggers: claude -p, AIFingerprintCollector, invokeAICLI, stripJsonFences, Zod parse error, AI response, skills-builder, generateAISkills.
---

# Debug the AI Analysis Pipeline

Reference for diagnosing failures in the two-stage AI analysis pipeline (fingerprint + skills generation).

## Core Rules

- Stage 1 (fingerprint): `AIFingerprintCollector.collect()` in `src/core/fingerprint/ai-collector.ts` — invokes `claude -p -` via stdin
- Stage 2 (skills): `generateAISkills(fingerprint)` in `src/core/fingerprint/skills-builder.ts` — non-fatal; failures are logged and skipped
- Prompts are built by pure functions — test them in isolation before suspecting the AI call
- `stripJsonFences()` strips markdown code fences from AI output before Zod parsing
- AI CLI is detected by `detectAICLI()` / `detectAICLIs()` — checks `PATH` dirs for executable named `claude`, `cursor`, etc.
- Verbose mode (`--verbose` flag or `OPENSKULLS_VERBOSE=1`) logs the raw AI response before parsing
- Zod parse errors include the field path — check `err.errors` for the exact failing field

## Key Files

| File | Purpose |
|---|---|
| `src/core/fingerprint/ai-collector.ts` | `AIFingerprintCollector`, `invokeAICLI()`, `detectAICLI()`, `stripJsonFences()` |
| `src/core/fingerprint/prompt-builder.ts` | `buildAnalysisPrompt()` — stage 1 prompt |
| `src/core/fingerprint/skills-prompt.ts` | `buildSkillsPrompt()` — stage 2 prompt |
| `src/core/fingerprint/skills-builder.ts` | `generateAISkills()`, `AISkillsResponse` Zod schema |
| `src/core/fingerprint/types.ts` | `RepoFingerprintSchema` — what stage 1 must produce |

## Pattern

```typescript
// Quick isolation test — run stage 1 prompt manually
import { buildAnalysisPrompt } from './src/core/fingerprint/prompt-builder.js'
import { invokeAICLI, stripJsonFences } from './src/core/fingerprint/ai-collector.js'
import { RepoFingerprintSchema } from './src/core/fingerprint/types.js'

const prompt = buildAnalysisPrompt('myrepo', fileTree, configContents)
const raw = await invokeAICLI(cliPath, prompt)
const cleaned = stripJsonFences(raw)
console.log(cleaned)  // inspect before parse
const parsed = RepoFingerprintSchema.safeParse(JSON.parse(cleaned))
console.log(parsed.error?.errors)  // see exact field failures
```

## Anti-Patterns

- Do not add `JSON.parse` without first calling `stripJsonFences()` — AI often wraps output in fences
- Do not make stage 2 (skills) fatal — it is intentionally non-blocking; restore that if you break it
- Do not extend prompts with contradictory instructions — keep the JSON schema description in the prompt in sync with the Zod schema

## Checklist

- [ ] Verified `detectAICLI()` finds the expected binary in PATH
- [ ] Printed raw AI response before `stripJsonFences()` to confirm output format
- [ ] Checked `ZodError.errors` for exact failing field paths
- [ ] Confirmed prompt in `prompt-builder.ts` matches current `RepoFingerprintSchema` fields
- [ ] For stage 2 failures, confirmed `generateAISkills()` failure is non-fatal in `init.ts`
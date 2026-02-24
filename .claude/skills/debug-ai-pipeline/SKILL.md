---
name: debug-ai-pipeline
description: >
  Use when the AI fingerprint collection or skills generation is failing, returning bad JSON, or producing incorrect analysis.
  Triggers: AI analysis fails, bad JSON, claude -p, stdin prompt, stripJsonFences, AIFingerprintCollector, invokeAICLI, skills generation error.
---

# Debug AI Analysis Pipeline

Reference for diagnosing and fixing failures in the two-stage AI analysis pipeline (fingerprint collection + skills generation).

## Core Rules

- AI prompts are always sent via `child.stdin` — never via command-line args — to avoid ARG_MAX limits; verify stdin is being written and closed correctly
- The AI response is expected as a raw JSON object; `stripJsonFences()` in `src/core/fingerprint/ai-collector.ts` strips ` ```json ` fences before `JSON.parse()`
- After parsing, responses are validated with `Zod.parse()` — schema mismatch errors mean either the prompt is underspecified or the schema needs an `.optional()` fallback
- `detectAICLI()` walks `PATH` dirs checking execute permission — if it returns `null`, no supported AI CLI is installed or not on PATH
- Skills generation (`generateAISkills()` in `src/core/fingerprint/skills-builder.ts`) is non-fatal — log the error and continue rather than aborting `init`
- Use `OPENSKULLS_DEBUG=1` or temporary `console.error` logging to inspect raw AI stdout before parsing

## Key Files

- `src/core/fingerprint/ai-collector.ts` — `AIFingerprintCollector`, `invokeAICLI()`, `detectAICLIs()`, `stripJsonFences()`
- `src/core/fingerprint/prompt-builder.ts` — `buildAnalysisPrompt()` — primary prompt text
- `src/core/fingerprint/skills-builder.ts` — `generateAISkills()`, `AISkillsResponse` schema
- `src/core/fingerprint/skills-prompt.ts` — `buildSkillsPrompt(fingerprint)` — skills prompt text
- `src/core/fingerprint/types.ts` — `RepoFingerprintSchema` — Zod schema used to validate AI response

## Anti-Patterns

- Do not retry the same prompt on transient failures without a backoff — surface the error to the user and let them re-run
- Do not swallow Zod parse errors silently in the fingerprint stage — these indicate the AI returned an incompatible structure
- Do not pass the prompt as a CLI argument (`claude -p "$(cat ...)"`) — use stdin to handle large prompts safely
- Do not assume the AI wraps JSON in fences consistently — always run `stripJsonFences()` before `JSON.parse()`

## Checklist

- [ ] Verified `detectAICLI()` returns a non-null path for the target AI CLI
- [ ] Raw AI stdout captured and inspected before `stripJsonFences()` and `JSON.parse()`
- [ ] Zod parse error message identifies which field is missing or mistyped
- [ ] Prompt updated in `buildAnalysisPrompt()` or `buildSkillsPrompt()` if the AI misunderstood the schema
- [ ] Schema field made `.optional()` if the AI reliably omits it for some repo types
- [ ] `npm test` passes after fix
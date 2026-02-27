---
name: extend-fingerprint
description: >
  Use when adding new detected fields to RepoFingerprint or the AI analysis response.
  Triggers: new fingerprint field, RepoFingerprint schema, AIAnalysisResponse, Zod schema, fingerprint drift, contentHash.
---

# Extend the RepoFingerprint Schema

Reference for safely adding fields to the RepoFingerprint Zod schema without breaking existing fingerprint caches or content-hash stability.

## Core Rules

- All schema changes go in `src/core/fingerprint/types.ts`
- New fields MUST have a `.default()` or `.optional()` so old cached fingerprints still parse
- Fields included in content-hash diffing are controlled inside `hasDrifted()` — only add a field to the drift check if it should invalidate the cache
- If the AI should populate the new field, add it to the response schema `AIAnalysisResponse` in `src/core/fingerprint/ai-collector.ts` AND update `buildAnalysisPrompt()` in `src/core/fingerprint/prompt-builder.ts`
- The AI prompt template lives at `templates/prompts/analysis.md.hbs` — keep the JSON example in sync with any new fields
- After changing schemas, regenerate `contentHash` logic in `createFingerprint()` if needed

## Key Files

```
src/core/fingerprint/types.ts           — RepoFingerprintSchema, createFingerprint(), hasDrifted()
src/core/fingerprint/ai-collector.ts   — AIAnalysisResponse Zod schema, invokeAICLI()
src/core/fingerprint/prompt-builder.ts — buildAnalysisPrompt() — update JSON example here
templates/prompts/analysis.md.hbs      — AI prompt template with expected JSON shape
```

## Pattern

```typescript
// src/core/fingerprint/types.ts
export const RepoFingerprintSchema = z.object({
  // ... existing fields ...
  myNewField: z.string().optional(),          // safe for old caches
  myRequiredField: z.string().default(''),   // required but backward-compatible
})

// AIAnalysisResponse in ai-collector.ts
export const AIAnalysisResponseSchema = z.object({
  // ... existing ...
  myNewField: z.string().optional(),
})
```

## Anti-Patterns

- Do not add required fields without `.default()` — old fingerprint.json files will fail to parse
- Do not forget to update the JSON example in `templates/prompts/analysis.md.hbs` — the AI follows that schema
- Do not put display/formatting logic in types.ts — keep it in generators or UI layer

## Checklist

- [ ] New field added to `RepoFingerprintSchema` with `.optional()` or `.default()`
- [ ] If AI-sourced: field added to `AIAnalysisResponseSchema` in `ai-collector.ts`
- [ ] `buildAnalysisPrompt()` and `analysis.md.hbs` updated with new field in JSON example
- [ ] `hasDrifted()` updated if the field should invalidate cached fingerprints
- [ ] Existing tests still pass with old fixture data
- [ ] New test covers the field being populated and round-tripped
- [ ] `npm test` passes
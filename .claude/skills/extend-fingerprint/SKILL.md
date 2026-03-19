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
- If the AI should populate the new field, add it to:
  1. `AIAnalysisResponse` schema in `src/core/fingerprint/ai-collector.ts`
  2. `buildAnalysisPrompt()` in `src/core/fingerprint/prompt-builder.ts`
  3. `normaliseAnalysisResponse()` in `ai-collector.ts` — add a fallback mapping for non-conforming AI responses (Copilot returns different field names)
  4. The JSON example in `templates/prompts/analysis.md.hbs`
- After changing schemas, regenerate `contentHash` logic in `createFingerprint()` if needed
- `WorkspaceFingerprint` (in `workspace-types.ts`) is a separate schema for per-workspace data — extend it when workspace-specific fields are needed

## Key Files

```
src/core/fingerprint/types.ts              — RepoFingerprintSchema, createFingerprint(), hasDrifted()
src/core/fingerprint/ai-collector.ts       — AIAnalysisResponse schema, normaliseAnalysisResponse()
src/core/fingerprint/prompt-builder.ts     — buildAnalysisPrompt() — update JSON example here
src/core/fingerprint/workspace-types.ts    — WorkspaceFingerprint, WorkspaceMapEntry types
src/core/fingerprint/workspace-collector.ts — collectWorkspaceFingerprints(), buildAggregateFingerprint()
src/core/fingerprint/foreign-file-types.ts  — ForeignFileContext, ForeignFileScan types
templates/prompts/analysis.md.hbs          — AI prompt template with expected JSON shape
```

## Pattern

```typescript
// 1. src/core/fingerprint/types.ts — add to RepoFingerprint
export const RepoFingerprintSchema = z.object({
  // ... existing fields ...
  myNewField: z.string().optional(),          // safe for old caches
  myRequiredField: z.string().default(''),   // required but backward-compatible
})

// 2. src/core/fingerprint/ai-collector.ts — add to AIAnalysisResponse
export const AIAnalysisResponse = z.object({
  // ... existing ...
  myNewField: z.string().optional(),
})

// 3. src/core/fingerprint/ai-collector.ts — add normalisation fallback
export function normaliseAnalysisResponse(raw: any): Record<string, unknown> {
  const out = { ...raw }
  // Map alternative field name from non-conforming CLIs
  if (!out.myNewField && typeof raw.my_new_field === 'string') {
    out.myNewField = raw.my_new_field
  }
  return out
}

// 4. Update templates/prompts/analysis.md.hbs JSON example to include the new field
```

## Anti-Patterns

- Do not add required fields without `.default()` — old fingerprint.json files will fail to parse
- Do not forget to update `normaliseAnalysisResponse()` — Copilot and other CLIs may return alternative field names
- Do not forget to update the JSON example in `templates/prompts/analysis.md.hbs` — the AI follows that schema
- Do not put display/formatting logic in types.ts — keep it in generators or UI layer

## Checklist

- [ ] New field added to `RepoFingerprintSchema` with `.optional()` or `.default()`
- [ ] If AI-sourced: field added to `AIAnalysisResponse` in `ai-collector.ts`
- [ ] `normaliseAnalysisResponse()` updated with fallback for alternative field names
- [ ] `buildAnalysisPrompt()` and `analysis.md.hbs` updated with new field in JSON example
- [ ] `hasDrifted()` updated if the field should invalidate cached fingerprints
- [ ] Existing tests still pass with old fixture data
- [ ] New test covers the field being populated and round-tripped
- [ ] `bun test` passes

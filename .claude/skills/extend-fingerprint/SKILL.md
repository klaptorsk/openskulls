---
name: extend-fingerprint
description: >
  Use when adding new detected fields to RepoFingerprint or the AI analysis response.
  Triggers: new fingerprint field, RepoFingerprint schema, AIAnalysisResponse, Zod schema, fingerprint drift, contentHash.
---

# Extend the Repo Fingerprint Schema

Reference for safely adding new fields to the fingerprint data model and keeping Zod, AI prompt, and hash logic in sync.

## Core Rules

- All schema changes go in `src/core/fingerprint/types.ts` — this is the single source of truth
- New fields must be added to the Zod schema; use `.optional()` for backwards-compatible additions
- The `contentHash` excludes `repoRoot`, `generatedAt`, `contentHash` — no other exclusions; verify `createFingerprint()` still produces deterministic hashes after your change
- If the AI must populate the new field, update `buildAnalysisPrompt()` in `src/core/fingerprint/prompt-builder.ts` to instruct the model
- The AI response schema `AIAnalysisResponse` in `src/core/fingerprint/ai-collector.ts` must mirror the new field if AI-populated
- After schema changes, re-run `openskulls init` in a test repo to validate end-to-end
- Cached fingerprints in `.openskulls/fingerprint.json` may be stale — `hasDrifted()` handles this gracefully

## Key Files

| File | Purpose |
|---|---|
| `src/core/fingerprint/types.ts` | `RepoFingerprintSchema`, `createFingerprint()`, `hasDrifted()` |
| `src/core/fingerprint/ai-collector.ts` | `AIAnalysisResponse` Zod schema, AI invocation |
| `src/core/fingerprint/prompt-builder.ts` | `buildAnalysisPrompt()` — controls what AI detects |
| `src/core/fingerprint/cache.ts` | `loadFingerprint()`, `saveFingerprint()` |

## Pattern

```typescript
// src/core/fingerprint/types.ts — add optional field
export const RepoFingerprintSchema = z.object({
  // ... existing fields ...
  myNewField: z.string().optional(),  // backwards-compatible
})

// src/core/fingerprint/ai-collector.ts — mirror in AI response
export const AIAnalysisResponse = z.object({
  // ... existing fields ...
  myNewField: z.string().optional(),
})
```

## Anti-Patterns

- Do not add required fields without a migration path — existing cached fingerprints will fail Zod parse
- Do not modify `contentHash` exclusion logic without updating tests for determinism
- Do not add fields to the AI response schema without updating the prompt — the model won't know to populate them

## Checklist

- [ ] Field added to `RepoFingerprintSchema` in `types.ts`
- [ ] `AIAnalysisResponse` updated in `ai-collector.ts` if AI-populated
- [ ] `buildAnalysisPrompt()` updated to instruct the model
- [ ] `createFingerprint()` / `hasDrifted()` still work correctly
- [ ] Tests updated or added for the new field
- [ ] `npm test` passes
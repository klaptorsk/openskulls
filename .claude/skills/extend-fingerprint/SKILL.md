---
name: extend-fingerprint
description: >
  Use when adding new detected fields to RepoFingerprint or the AI analysis response.
  Triggers: new fingerprint field, RepoFingerprint schema, AIAnalysisResponse, Zod schema, fingerprint drift, contentHash.
---

# Extend RepoFingerprint

Reference for safely adding new fields to the fingerprint schema with runtime validation and drift detection.

## Core Rules

- All schemas live in `src/core/fingerprint/types.ts` — `RepoFingerprintSchema`, `AIAnalysisResponseSchema`
- Types are always `z.infer<typeof Schema>` — never write a manual interface that duplicates a schema
- New fields added to `RepoFingerprintSchema` must also be reflected in `AIAnalysisResponseSchema` if they come from the AI call
- `contentHash` excludes `repoRoot`, `generatedAt`, and `contentHash` itself — verify the exclusion list if adding identity fields
- `hasDrifted()` in `types.ts` compares hashes — no logic changes needed for new data fields
- Update `buildAnalysisPrompt()` in `src/core/fingerprint/prompt-builder.ts` if the AI needs to populate the new field
- Saved fingerprints in `.openskulls/fingerprint.json` must remain forward-compatible — use `.optional()` for new fields

## Key Files

```
src/core/fingerprint/types.ts          — RepoFingerprintSchema, AIAnalysisResponseSchema, createFingerprint(), hasDrifted()
src/core/fingerprint/ai-collector.ts   — AIFingerprintCollector, Zod-validates AI response
src/core/fingerprint/prompt-builder.ts — buildAnalysisPrompt() — update prompt to request new field
src/core/fingerprint/cache.ts          — loadFingerprint(), saveFingerprint()
templates/prompts/analysis.md.hbs      — AI analysis prompt template
```

## Anti-Patterns

- Do not add required fields without `.optional()` — breaks existing saved fingerprints
- Do not write manual TypeScript interfaces — derive from Zod schema with `z.infer<>`
- Do not access AI response fields before Zod parse — `AIFingerprintCollector` validates first
- Do not modify `contentHash` exclusion logic without understanding drift semantics

## Checklist

- [ ] Field added to `RepoFingerprintSchema` as `.optional()` for backwards compat
- [ ] Field added to `AIAnalysisResponseSchema` if AI-sourced
- [ ] `buildAnalysisPrompt()` / `analysis.md.hbs` updated to request the field
- [ ] `createFingerprint()` maps new field from AI response
- [ ] Tests updated in `tests/fingerprint/` to cover new field
- [ ] `npm test` passes
- [ ] README.md updated if user-visible
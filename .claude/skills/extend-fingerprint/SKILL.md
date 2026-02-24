---
name: extend-fingerprint
description: >
  Use when adding new fields to the RepoFingerprint data model or modifying what the AI analysis collects.
  Triggers: new fingerprint field, schema change, add to fingerprint, RepoFingerprint, Zod schema update, analysis prompt.
---

# Extend the Fingerprint Schema

Reference for safely adding or changing fields in the `RepoFingerprint` Zod schema without breaking existing cached fingerprints or downstream consumers.

## Core Rules

- All schema changes go in `src/core/fingerprint/types.ts` — this is the single source of truth
- New fields MUST have `.optional()` or a `.default()` to maintain backward compatibility with cached fingerprints on disk
- Types are always `z.infer<typeof FingerprintSchema>` — never write manual TypeScript interfaces
- After changing the schema, update `buildAnalysisPrompt()` in `src/core/fingerprint/prompt-builder.ts` so the AI knows to populate the new field
- Update `createFingerprint()` and `hasDrifted()` in `src/core/fingerprint/types.ts` if drift detection must account for the new field
- The content hash excludes `repoRoot`, `generatedAt`, and `contentHash` — verify same-codebase stability after changes
- Validate AI responses with `FingerprintSchema.parse()` — Zod will strip unknown fields and apply defaults automatically

## Key Files

- `src/core/fingerprint/types.ts` — `RepoFingerprintSchema`, `createFingerprint()`, `hasDrifted()`
- `src/core/fingerprint/prompt-builder.ts` — `buildAnalysisPrompt()` — instructs AI on what to return
- `src/core/fingerprint/ai-collector.ts` — `AIFingerprintCollector`, `AIAnalysisResponse`, `stripJsonFences()`
- `src/core/fingerprint/cache.ts` — load/save fingerprint to `.openskulls/fingerprint.json`
- `tests/fingerprint/` — schema + collector tests

## Anti-Patterns

- Do not add required fields without defaults — cached `.openskulls/fingerprint.json` files will fail `parse()`
- Do not write manual TypeScript types alongside Zod schemas — use `z.infer<>` exclusively
- Do not include the new field in the content hash computation unless drift on that field should trigger a sync
- Do not forget to update the AI prompt — the schema change is invisible to the AI unless the prompt explains the new field

## Checklist

- [ ] New field added to `RepoFingerprintSchema` with `.optional()` or `.default()`
- [ ] `buildAnalysisPrompt()` updated to describe the new field to the AI
- [ ] `createFingerprint()` updated if the field needs a computed initial value
- [ ] `hasDrifted()` updated if drift on the new field should trigger re-sync
- [ ] Existing snapshot tests still pass (content hash stability)
- [ ] New unit test covers the schema change and prompt output
- [ ] `npm test` passes
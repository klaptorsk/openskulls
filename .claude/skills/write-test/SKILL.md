---
name: write-test
description: >
  Use when adding or fixing tests in the openskulls test suite.
  Triggers: vitest, test file, describe, it, expect, makeContext, temp dir, test helper, unit test, integration test.
---

# Write a Test

Reference for authoring tests that follow openskulls vitest conventions.

## Core Rules

- All tests live under `tests/` matching `tests/**/*.test.ts`
- Use `makeContext(files)` from `tests/helpers/index.ts` for any test that needs real files on disk
- Always call `cleanup()` in `afterEach` — `makeContext` creates real temp dirs that must be removed
- Pure functions (prompt builders, Zod schemas, `stripJsonFences`, `mergeSections`) are tested directly — no temp dirs needed
- Never mock the filesystem — write real files via `makeContext`
- Do not mock `invokeAICLI` in unit tests — test the pure functions around it instead
- Use `vi.spyOn` only for time-sensitive or external-network concerns
- Test file mirrors source path: `src/core/generators/merge.ts` → `tests/generators/merge.test.ts`

## Pattern

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { makeContext } from '../helpers/index.js'
import { mergeSections } from '../../src/core/generators/merge.js'

describe('mergeSections', () => {
  it('preserves user edits inside tagged sections', () => {
    const existing = '<!-- openskulls:section:foo -->\nuser edit\n<!-- /openskulls:section:foo -->'
    const next = '<!-- openskulls:section:foo -->\nnew content\n<!-- /openskulls:section:foo -->'
    const result = mergeSections(existing, next)
    expect(result).toContain('user edit')
  })
})

// For filesystem tests:
describe('MyGenerator', () => {
  let cleanup: () => Promise<void>
  afterEach(async () => { await cleanup?.() })

  it('emits expected files', async () => {
    const ctx = await makeContext({ 'package.json': '{"name":"test"}' })
    cleanup = ctx.cleanup
    // use ctx.dir for real path
  })
})
```

## Anti-Patterns

- Do not skip `cleanup()` — temp dirs accumulate and cause flaky tests
- Do not import from `../../src/...` without the `.js` extension — NodeNext ESM requires explicit extensions
- Do not write tests that depend on PATH or installed CLIs — test pure functions instead
- Do not use `test.only` or `describe.only` in committed code

## Checklist

- [ ] Test file at `tests/<module>.test.ts` mirroring source path
- [ ] `makeContext` used for any filesystem interaction, `cleanup` called in `afterEach`
- [ ] Pure functions tested without mocks
- [ ] All imports use `.js` extension
- [ ] `npm test` passes with no skipped tests
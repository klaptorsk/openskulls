---
name: write-test
description: >
  Use when adding or updating tests for any module in this project.
  Triggers: write test, add test, vitest, test file, makeContext, unit test, integration test, failing test.
---

# Write a Vitest Test

Reference for writing vitest tests following the patterns established in this codebase.

## Core Rules

- Test files live under `tests/**/*.test.ts` and mirror the `src/` module structure
- Use `makeContext(files)` from `tests/helpers/index.ts` for any test that needs a real temp directory — it creates the dir and returns `{ctx, dir, cleanup}`
- Always call `cleanup()` in `afterEach` to remove temp dirs — never leave temp state behind
- Test pure functions (Zod schemas, prompt builders, `mergeSections`, `stripJsonFences`) directly without mocking
- Mock subprocess calls (`invokeAICLI`, `child_process`) with `vi.mock()` — never spawn real AI CLIs in tests
- Use `vi.spyOn(fs, 'writeFile')` to assert generator output without touching disk when `makeContext` is overkill
- Group related assertions with `describe` blocks matching the module name

## Pattern

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { makeContext } from '../helpers/index.js'
import { myFunction } from '../../src/core/my-module.js'

describe('myFunction', () => {
  let cleanup: () => Promise<void>

  afterEach(async () => { await cleanup?.() })

  it('does the thing', async () => {
    const { ctx, dir, cleanup: c } = await makeContext({ 'package.json': '{"name":"test"}' })
    cleanup = c
    const result = await myFunction(ctx)
    expect(result).toMatchObject({ name: 'test' })
  })
})
```

## Anti-Patterns

- Do not use `process.chdir()` in tests — it mutates global state and breaks parallel test runs; use absolute paths from `dir` instead
- Do not import with bare module specifiers on relative paths — NodeNext ESM requires `.js` extensions on all relative imports
- Do not write to `process.cwd()` in tests — always use the temp dir from `makeContext`
- Do not skip `cleanup()` even on test failure — use `afterEach`, not `afterAll`

## Checklist

- [ ] Test file placed under `tests/` mirroring `src/` structure
- [ ] `makeContext` used for any test requiring the filesystem
- [ ] `cleanup()` called in `afterEach`
- [ ] AI/subprocess calls mocked with `vi.mock()` or `vi.spyOn()`
- [ ] All relative imports use `.js` extension
- [ ] `npm test` passes with no new failures
---
name: write-test
description: >
  Use when adding or fixing tests in the openskulls test suite.
  Triggers: vitest, test file, describe, it, expect, makeContext, temp dir, test helper, unit test, integration test.
---

# Write a Test

Reference for adding tests in the openskulls vitest suite following the temp-dir and pure-function patterns.

## Core Rules

- Test files live in `tests/**/*.test.ts` and must import vitest helpers from `'vitest'`
- Use `makeContext(files)` from `tests/helpers/index.ts` for any test that needs a real filesystem
- Always call `cleanup()` in an `afterEach` block — never leave temp dirs behind
- Pure functions (prompt builders, Zod schemas, merge logic, shared helpers) are tested directly without any mocking
- Do NOT mock `fs` — use real temp directories created by `makeContext()`
- Do not test private implementation details — test observable outputs (returned `GeneratedFile[]`, parsed schemas, rendered strings)
- Generator tests: call `generator.generate(fingerprint)` and assert on `GeneratedFile[]` contents

## Key Files

```
tests/helpers/index.ts                       — makeContext(files), returns { ctx, dir, cleanup }
tests/fingerprint/prompt-builder.test.ts    — example: pure function test pattern
tests/generators/claude-code.test.ts        — example: generator output test pattern
tests/merge.test.ts                         — example: mergeSections unit tests
```

## Pattern

```typescript
// tests/generators/myengine.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { makeContext } from '../helpers/index.js'
import { MyEngineGenerator } from '../../src/core/generators/myengine.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'

let cleanup: () => Promise<void>

afterEach(async () => { await cleanup?.() })

describe('MyEngineGenerator', () => {
  it('emits the expected output file', async () => {
    const { ctx, cleanup: c } = await makeContext({})
    cleanup = c
    const fp = createFingerprint({ repoRoot: ctx.repoRoot, projectName: 'test' })
    const gen = new MyEngineGenerator()
    const files = gen.generate(fp)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('MY_ENGINE_FILE.md')
    expect(files[0].content).toContain('test')
  })
})
```

## Anti-Patterns

- Do not use `vi.mock()` for filesystem calls — use real temp dirs instead
- Do not share `ctx` or `dir` between `it()` blocks — create fresh context per test
- Do not skip `cleanup()` — lingering temp dirs accumulate in `/tmp`

## Checklist

- [ ] Test file placed under `tests/` matching the source module path
- [ ] `makeContext()` used for any filesystem-dependent test
- [ ] `cleanup()` called in `afterEach`
- [ ] Assertions cover both happy path and at least one edge/error case
- [ ] `npm test` passes with no new failures
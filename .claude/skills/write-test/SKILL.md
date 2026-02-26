---
name: write-test
description: >
  Use when adding or fixing tests in the openskulls test suite.
  Triggers: vitest, test file, describe, it, expect, makeContext, temp dir, test helper, unit test, integration test.
---

# Write a Vitest Test

Reference for writing tests that follow openskulls vitest conventions.

## Core Rules

- Test files live in `tests/` and match `tests/**/*.test.ts`
- Use `makeContext(files)` from `tests/helpers/index.ts` for any test needing a real filesystem
- Always call `cleanup()` in `afterEach` — `makeContext` creates real temp dirs
- Pure functions (prompts, schemas, merge logic) need no mocking — test them directly with inputs and assert outputs
- AI CLI invocations (`invokeAICLI`) must be mocked — do not make real subprocess calls in tests
- Use `vi.mock` for module-level mocks; `vi.spyOn` for method-level
- Import paths must use `.js` extension (NodeNext ESM)
- TypeScript strict mode applies to test files

## Key Files

| File | Purpose |
|---|---|
| `tests/helpers/index.ts` | `makeContext(files)` — creates temp dir, returns `{ctx, dir, cleanup}` |
| `tests/fingerprint/` | Fingerprint schema + collector tests — reference examples |
| `tests/generators/` | Generator output tests |
| `vitest.config.ts` | Vitest configuration |

## Pattern

```typescript
// tests/my-module/my-module.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { makeContext } from '../helpers/index.js'
import { myFunction } from '../../src/core/my-module/my-function.js'

describe('myFunction', () => {
  let cleanup: () => Promise<void>

  afterEach(async () => { await cleanup?.() })

  it('returns expected output for valid input', async () => {
    const { ctx, dir, cleanup: c } = await makeContext({
      'src/index.ts': 'export const x = 1'
    })
    cleanup = c
    const result = myFunction(ctx)
    expect(result).toEqual({ field: 'value' })
  })
})
```

## Anti-Patterns

- Do not import with bare specifiers like `'../../src/foo'` — always add `.js` extension
- Do not skip `cleanup()` — temp dirs accumulate and pollute `/tmp`
- Do not make real AI CLI calls in tests — mock `invokeAICLI` from `ai-collector.ts`
- Do not test implementation details — test observable outputs (returned values, written files)

## Checklist

- [ ] Test file in `tests/**/*.test.ts`
- [ ] `cleanup()` called in `afterEach` if `makeContext` is used
- [ ] All imports use `.js` extension
- [ ] AI/subprocess calls mocked with `vi.mock` or `vi.spyOn`
- [ ] `npm test` passes with no new failures
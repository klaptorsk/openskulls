---
description: Run the full test suite using bun test.
---
Run the full test suite.
1. Execute `/home/ehs/.bun/bin/bun run test` from `/home/ehs/git/openskulls`. Never use bare `bun` or `npm` — they are not on PATH; always use the full path `/home/ehs/.bun/bin/bun`.
2. Read any failing test output carefully before attempting a fix.
3. Tests match the pattern `tests/**/*.test.ts`.
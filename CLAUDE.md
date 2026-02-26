# openskulls

<!-- openskulls:section:overview -->
## Project Overview

CLI tool.
Makes your repo readable to AI agents, then keeps it readable as the code evolves.
Primary language: **TypeScript**.

<!-- /openskulls:section:overview -->

<!-- openskulls:section:tech_stack -->
## Tech Stack

- **TypeScript** 5.5.0 *(primary)* — 100% of source files
### Frameworks & Libraries
- **commander** 12.1.0 (cli)
- **zod** 3.23.8 (utility)
- **handlebars** 4.7.8 (utility)
- **simple-git** 3.25.0 (utility)
- **chalk** 5.3.0 (utility)
- **ora** 8.1.0 (utility)
- **smol-toml** 1.3.1 (utility)

<!-- /openskulls:section:tech_stack -->

<!-- openskulls:section:architecture -->
## Architecture

**Style**: CLI tool


**Entry points**:
- `src/index.ts`
**Module structure**:
- `src/cli/commands/`
- `src/core/fingerprint/`
- `src/core/generators/`
- `src/core/packages/`
- `src/core/config/`
- `src/cli/ui/`
- `templates/`
- `tests/`

<!-- /openskulls:section:architecture -->

<!-- openskulls:section:conventions -->
## Conventions

- **Nodenext Esm**: `NodeNext`
- **Typescript Strict**: `strict`
- **Zod Types**: `z.infer&lt;typeof Schema&gt;`
- **Generators No Io**: `GeneratedFile[] return only`
**Linting/Formatting**: eslint

<!-- /openskulls:section:conventions -->

<!-- openskulls:section:testing -->
## Testing

- **Framework**: vitest
- **Pattern**: `tests/**/*.test.ts`
- **Coverage**: v8

<!-- /openskulls:section:testing -->

<!-- openskulls:section:agent_guidance -->
## Agent Guidance


- Before making changes, read the relevant module's code to understand existing patterns.
- Run the test suite before proposing a commit.
- Do not modify files outside the scope of the current task.

<!-- /openskulls:section:agent_guidance -->

---

## Key Files

> Manually maintained — preserved across `openskulls sync`.

| Path | Purpose |
|---|---|
| `src/core/fingerprint/types.ts` | Zod schemas, `createFingerprint()`, `hasDrifted()` |
| `src/core/fingerprint/collector.ts` | `FingerprintCollector` — scans repo, runs analyzers |
| `src/core/fingerprint/cache.ts` | `loadFingerprint()`, `saveFingerprint()` |
| `src/core/analyzers/base.ts` | `AnalyzerContext`, `AnalyzerResult`, `BaseAnalyzer` |
| `src/core/analyzers/registry.ts` | `getBuiltinAnalyzers()` — hardcoded list for v0.1 |
| `src/core/generators/base.ts` | `GeneratedFile`, `BaseGenerator`, `repoFile()`, `personalFile()` |
| `src/core/generators/claude-code.ts` | `ClaudeCodeGenerator` — renders CLAUDE.md via Handlebars |
| `src/core/generators/merge.ts` | `mergeSections()` — pure section merge, no I/O |
| `src/cli/commands/init.ts` | Full init flow: analyse → signals → plan → confirm → write |
| `src/cli/ui/console.ts` | `log.*`, `panel()`, `table()`, `spinner()`, `fatal()` |
| `templates/claude-code/CLAUDE.md.hbs` | Handlebars template with tagged sections |
| `tests/helpers/index.ts` | `makeContext(files)` test factory |

---

## MVP Status

| Step | Task | Status |
|---|---|---|
| 1 | Data models — RepoFingerprint, SkullPackage, configs | ✅ |
| 2 | FingerprintCollector + language analyzers (py, js, ts, go) | ✅ |
| 3 | Claude Code generator — CLAUDE.md + .claude/commands/ + settings.json | ✅ |
| 4 | Wire `openskulls init` — collector → generator → writer + merge | ✅ |
| 5 | Interviewer — 4-question init flow, save to config.toml | ⬜ |
| 6 | Git hook installer + non-blocking `openskulls sync` | ⬜ |
| 7 | Dependency drift check + `openskulls audit` | ⬜ |
| 8 | `openskulls add` — local packages only | ⬜ |

<!-- openskulls:section:workflow_rules -->
## Workflow Rules

- **Documentation**: After adding or updating a feature, always update README.md and any relevant documentation files before marking the task complete.
- **Commits**: After completing a feature or fix, stage the relevant changed files and create a git commit with an appropriate message.

<!-- /openskulls:section:workflow_rules -->
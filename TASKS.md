# OpenSkulls — Task Tracker

> Updated: 2026-02-24

---

## Rules

- **Documentation**: whenever a feature is added or updated, `README.md` must be updated to reflect it. Mandatory.

---

## MVP Build Steps (v0.1)

| # | Task | Status |
|---|---|---|
| 1 | Data models — RepoFingerprint, SkullPackage, configs | ✅ Done |
| 2 | FingerprintCollector + language analyzers (py, js, ts, go) | ✅ Done |
| 3 | Claude Code generator — CLAUDE.md + .claude/commands/ + settings.json | ✅ Done |
| 4 | Wire `openskulls init` — collector → generator → file writer + merge | ✅ Done |
| 5 | Interviewer — 4-question init flow, save to config.toml | ⬜ Pending |
| 6 | Git hook installer + non-blocking `openskulls sync` | ⬜ Pending |
| 7 | Dependency drift check + `openskulls audit` command | ⬜ Pending |
| 8 | `openskulls add` — local packages only (no registry yet) | ⬜ Pending |

---

## From TODOS.md

| # | Task | Status |
|---|---|---|
| T-1 | Free installer — npm --no-fund / shell script / no billing surprises | ✅ Done |
| T-4 | IDE-agnostic generator support — VSCode, JetBrains, Zed, etc. | ⬜ Pending |
| T-5 | Auto-detect installed AI coding CLIs at init (Claude Code, Cursor, Cline, Copilot, Continue, Aider) | ⬜ Pending |
| T-6 | Intelligent questionnaire — infra, DBs, performance priorities, platform | ⬜ Pending |
| T-7 | Terminal UI — skull theme, bloody red accent, pulsating animation, ASCII art header | ⬜ Pending |
| T-8 | Workflow automation — help users define and maintain agentic skills/instructions | ⬜ Pending |
| T-9 | More language analyzers — C#, Rust, SQL/MSSQL, Ruby, Java, PHP | ⬜ Pending |
| T-10 | Optional agentic engineering workflow layer for any developer | ⬜ Pending |

---

## Completed Detail

### Step 1 — Data models
- `src/core/fingerprint/types.ts` — RepoFingerprint (Zod), createFingerprint(), hasDrifted()
- `src/core/packages/types.ts` — Skill, Rule, SkullPackage, Lockfile
- `src/core/config/types.ts` — ProjectConfig, GlobalConfig
- `src/core/generators/base.ts` — GeneratedFile, BaseGenerator, repoFile(), personalFile()
- `src/core/analyzers/base.ts` — AnalyzerContext, AnalyzerResult, BaseAnalyzer

### Step 2 — FingerprintCollector + analyzers
- `src/core/fingerprint/collector.ts` — FingerprintCollector, scanRepo, mergeResults
- `src/core/fingerprint/cache.ts` — loadFingerprint(), saveFingerprint()
- `src/core/analyzers/registry.ts` — getBuiltinAnalyzers()
- `src/core/analyzers/language/python.ts`
- `src/core/analyzers/language/javascript.ts`
- `src/core/analyzers/language/typescript.ts`
- `src/core/analyzers/language/go.ts`

### Step 3 — Claude Code generator
- `src/core/generators/claude-code.ts` — ClaudeCodeGenerator
- `templates/claude-code/CLAUDE.md.hbs` — Handlebars template with tagged sections
- 32 tests in `tests/generators/claude-code.test.ts`

### Step 4 — `openskulls init`
- `src/core/generators/merge.ts` — mergeSections(), parseChunks(), extractSections()
- `src/cli/commands/init.ts` — full init flow: analyse → signals → plan → confirm → write → save
- 15 tests in `tests/generators/merge.test.ts`
- Total: **138 tests passing**, typecheck clean

---

## Notes
- TODOS #2 (build init) and #3 (evaluate todos) are resolved — init is done, this file is the evaluation.
- T-4 and T-5 are related — detecting CLIs informs which generators to run.
- T-6 extends Step 5 (Interviewer) with deeper infrastructure questions.
- T-10 and T-8 overlap — keep them as separate tracks (workflow definition vs. workflow automation).

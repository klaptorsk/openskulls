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
| 2 | AI-powered fingerprint collection — `AIFingerprintCollector` + `buildAnalysisPrompt` | ✅ Done |
| 3 | Claude Code generator — CLAUDE.md + .claude/commands/ + settings.json | ✅ Done |
| 4 | Wire `openskulls init` — collector → generator → file writer + merge | ✅ Done |
| 5 | Git hook installer + non-blocking `openskulls sync` | ✅ Done |
| T-AI | AI-generated project skills — `buildSkillsPrompt`, `generateAISkills`, `.claude/skills.md` + per-skill command files | ✅ Done |
| 6 | Interviewer — structured init flow, save answers to config.toml | ⬜ Pending |
| 7 | Dependency drift check + `openskulls audit` command | ⬜ Pending |
| 8 | `openskulls add` — local packages only (no registry yet) | ⬜ Pending |

---

## Backlog

| # | Task | Status |
|---|---|---|
| T-4 | IDE-agnostic generator support — Cursor rules, Copilot instructions, Zed, JetBrains | ⬜ Pending |
| T-6 | Intelligent questionnaire — infra, DBs, performance priorities, platform (extends Step 6) | ⬜ Pending |
| T-7 | Terminal UI — skull theme, bloody red accent, pulsating animation, ASCII art header | ⬜ Pending |
| T-8 | Workflow automation — help users define and maintain agentic skills/instructions | ⬜ Pending |
| T-10 | Optional agentic engineering workflow layer for any developer | ⬜ Pending |

---

## Completed Detail

### Step 1 — Data models
- `src/core/fingerprint/types.ts` — RepoFingerprint (Zod), createFingerprint(), hasDrifted()
- `src/core/packages/types.ts` — Skill, Rule, SkullPackage, Lockfile
- `src/core/config/types.ts` — ProjectConfig, GlobalConfig
- `src/core/generators/base.ts` — GeneratedFile, BaseGenerator, repoFile(), personalFile()

### Step 2 — AI-powered fingerprint collection
Replaced hand-written TypeScript language parsers with a single AI call. The collector now scans the file tree locally (fast), then invokes `claude -p` with the repo context and Zod-validates the JSON response into a `RepoFingerprint`. Works for any language or framework without new code.

- `src/core/fingerprint/ai-collector.ts` — `AIFingerprintCollector`, `detectAICLIs()`, `stripJsonFences()`, `AIAnalysisResponse` schema
- `src/core/fingerprint/prompt-builder.ts` — `buildAnalysisPrompt()` pure function
- `src/core/fingerprint/cache.ts` — loadFingerprint(), saveFingerprint()
- `tests/fingerprint/ai-collector.test.ts` — 36 tests (pure function coverage)
- Deleted: `src/core/analyzers/` (base, registry, 4 language analyzers), `src/core/fingerprint/collector.ts`, `tests/analyzers/`

### Step 3 — Claude Code generator
- `src/core/generators/claude-code.ts` — ClaudeCodeGenerator
- `templates/claude-code/CLAUDE.md.hbs` — Handlebars template with tagged sections
- `tests/generators/claude-code.test.ts` — 40 tests

### Step 4 — `openskulls init`
- `src/core/generators/merge.ts` — mergeSections(), parseChunks(), extractSections()
- `src/cli/commands/init.ts` — full init flow: analyse → signals → plan → confirm → write → save
- `src/cli/commands/shared.ts` — writeGeneratedFile() shared by init + sync
- `tests/generators/merge.test.ts` — 15 tests

### Step 5 — Git hook installer + `openskulls sync`
- `src/cli/commands/hook.ts` — HOOK_MARKER, installGitHook(), isHookInstalled(), matchesTriggerPattern(), shouldTriggerSync()
- `src/cli/commands/sync.ts` — full interactive mode + hook mode (non-blocking, always exits 0)
- `tests/cli/hook.test.ts` — 16 tests
- **119 tests passing**, typecheck clean

### T-AI — AI-generated project skills
Second AI call (after fingerprinting) generates 8–15 project-specific skills. Emits `.claude/skills.md` (overview, grouped by category, `merge_sections`) and individual `.claude/commands/<id>.md` files (slash commands). Non-fatal: if AI call fails during `init`/`sync`, skills are skipped with a warning.

- `src/core/fingerprint/skills-prompt.ts` — `buildSkillsPrompt(fingerprint)` pure function
- `src/core/fingerprint/skills-builder.ts` — `AISkill` + `AISkillsResponse` Zod schemas, `generateAISkills(fingerprint)`
- `src/core/generators/base.ts` — added `aiSkills?: readonly AISkill[]` to `GeneratorInput`
- `src/core/generators/claude-code.ts` — emits `.claude/skills.md` + per-skill command files; `buildSkillsOverview()` + `buildSkillCommand()` helpers
- `src/core/fingerprint/ai-collector.ts` — exported `detectAICLI`, `invokeAICLI` (were private)
- `src/cli/commands/init.ts` + `sync.ts` — skills generation step after fingerprinting (non-fatal)
- `tests/fingerprint/skills-builder.test.ts` — 25 new tests
- `tests/generators/claude-code.test.ts` — 11 new tests for skills output
- **155 tests passing**, typecheck clean

---

## Notes
- T-4 and T-5 (detecting CLIs) are done — `detectAICLIs()` in ai-collector.ts covers Claude Code, Copilot, Cursor.
- T-6 extends Step 6 (Interviewer) with deeper infra/platform questions.
- T-10 and T-8 overlap — keep as separate tracks (workflow definition vs. workflow automation).
- Bugs B-1 through B-4 are moot — the AI analyzer handles description, architecture style, framework detection, and skill generation without hard-coded parsers.

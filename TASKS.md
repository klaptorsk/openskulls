# OpenSkulls — Task Tracker

> Updated: 2026-02-27

---

## Rules

- **Documentation**: whenever a feature is added or updated, `README.md` must be updated to reflect it. Mandatory.

---

## Active Tasks

| # | Task | Status |
|---|---|---|
| I-1 | Let the underlying AI text prompt output be visible by going in verbose by clicking ctrl-o similar to claude, we should be able to see it | ✅ Done |
| R-1 | Generator refactor — extract shared helpers (`STYLE_LABELS`, `isConventionalCommits()`, `buildWorkflowRules()`) from both generators into `base.ts` or a new `shared.ts` | ✅ Done |
| R-2 | Generator registry — add `src/core/generators/registry.ts` with `getBuiltinGenerators()`, handling always-on vs detection-based generators | ✅ Done |
| R-3 | Wire registry into CLI — replace hardcoded generator instantiation in `init.ts` and `sync.ts` (3 call sites) with registry lookup | ✅ Done |
| 6 | Interviewer — superseded by T-6 (AI-driven questionnaire). Static workflow questions (auto-docs, auto-commit, architect) kept; AI adds domain-specific questions on top. | 🔄 Superseded by T-6 |
| 7 | Dependency drift check + `openskulls audit` command | ⬜ Pending |
| 8 | `openskulls add` — local packages only (no registry yet) | ⬜ Pending |
| 14 | Skills remote — user configures a git remote (GitHub, GitLab, etc.) as their personal skills store; `openskulls skills push` publishes skills to that repo, `openskulls skills pull` fetches them into a new project | ⬜ Pending |
| 9 | Validate against a real external repo — confirm skill generation works end-to-end | ⬜ Pending |
| 10 | Decide: do we write anything into `.openskulls/` in the destination project? | ⬜ Pending |
| 11 | UI polish — align style with https://github.com/openclaw/openclaw | ⬜ Pending |
| 12 | `openskulls init` should offer to create a `TASKS.md` task tracker in the destination project with relevant continous update as we code along| ⬜ Pending |
| 13 | Strenghten the promt for generating skills, also see if there is any exisisting skills from this or another source - ask for repo | ⬜ Pending |
| B-1 | Remove or hide stub commands before beta — `audit`, `add`, `publish` are registered in `--help` but do nothing; either implement stubs as coming-soon notices outside the command list or remove them until real | ✅ Done |
| B-2 | Remove hardcoded `registry.openskulls.dev` default — `GlobalConfig.registryUrl` defaults to a non-existent domain; strip the field or leave it blank until a registry exists | ✅ Done |
| B-3 | Document verbose mode in README — ctrl-o AI prompt visibility (task I-1) is implemented but not mentioned anywhere in the docs | ✅ Done |
| B-4 | Document AI questionnaire in README — the T-6 AI-driven Q&A step during `init` is not explained in the README init flow section | ✅ Done |

---

## Backlog

| # | Task | Status |
|---|---|---|
| T-6 | AI-driven contextual questionnaire — fingerprint → AI generates repo-specific questions → user answers feed into skills + architect + CLAUDE.md rules. | ✅ Done |
| T-8 | Workflow automation — help users define and maintain agentic skills/instructions | ⬜ Pending |
| T-10 | Optional agentic engineering workflow layer for any developer | ⬜ Pending |

---

## Notes

- R-1 through R-3 are a refactor sequence: R-1 must land before R-2, R-2 before R-3.
- T-6 extends task 6 (Interviewer) with deeper infra/platform questions.
- T-10 and T-8 overlap — keep as separate tracks (workflow definition vs. workflow automation).
- `detectAICLIs()` in `ai-collector.ts` already covers Claude Code, Copilot, Cursor — the registry (R-2) should drive which generators run based on these detections.

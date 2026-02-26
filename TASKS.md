# OpenSkulls — Task Tracker

> Updated: 2026-02-24

---

## Rules

- **Documentation**: whenever a feature is added or updated, `README.md` must be updated to reflect it. Mandatory.

---

## Active Tasks

| # | Task | Status |
|---|---|---|
| I-1 | Let the underlying AI text prompt output be visible by going in verbose by clicking ctrl-o similar to claude, we should be able to see it | ✅ Done |
| R-1 | Generator refactor — extract shared helpers (`STYLE_LABELS`, `isConventionalCommits()`, `buildWorkflowRules()`) from both generators into `base.ts` or a new `shared.ts` | ✅ Done |
| R-2 | Generator registry — add `src/core/generators/registry.ts` with `getBuiltinGenerators()`, handling always-on vs detection-based generators | ⬜ Pending |
| R-3 | Wire registry into CLI — replace hardcoded generator instantiation in `init.ts` and `sync.ts` (3 call sites) with registry lookup | ⬜ Pending |
| 6 | Interviewer — structured init flow, save answers to config.toml | ⬜ Pending |
| 7 | Dependency drift check + `openskulls audit` command | ⬜ Pending |
| 8 | `openskulls add` — local packages only (no registry yet) | ⬜ Pending |
| 9 | Validate against a real external repo — confirm skill generation works end-to-end | ⬜ Pending |
| 10 | Decide: do we write anything into `.openskulls/` in the destination project? | ⬜ Pending |
| 11 | UI polish — align style with https://github.com/openclaw/openclaw | ⬜ Pending |
| 12 | `openskulls init` should offer to create a `TASKS.md` task tracker in the destination project with relevant continous update as we code along| ⬜ Pending |
| 13 | Strenghten the promt for generating skills, also see if there is any exisisting skills from this or another source - ask for repo | ⬜ Pending |

---

## Backlog

| # | Task | Status |
|---|---|---|
| T-6 | Intelligent questionnaire — infra, DBs, performance priorities, platform (extends task 6) | ⬜ Pending |
| T-8 | Workflow automation — help users define and maintain agentic skills/instructions | ⬜ Pending |
| T-10 | Optional agentic engineering workflow layer for any developer | ⬜ Pending |

---

## Notes

- R-1 through R-3 are a refactor sequence: R-1 must land before R-2, R-2 before R-3.
- T-6 extends task 6 (Interviewer) with deeper infra/platform questions.
- T-10 and T-8 overlap — keep as separate tracks (workflow definition vs. workflow automation).
- `detectAICLIs()` in `ai-collector.ts` already covers Claude Code, Copilot, Cursor — the registry (R-2) should drive which generators run based on these detections.

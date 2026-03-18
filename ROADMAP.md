# OpenSkulls Roadmap

> Implementation tasks for multi-session iteration.
> Status: ⬜ not started · 🔄 in progress · ✅ done · 🚫 blocked

---

## Feature A — Monorepo / Multi-workspace Support

**Goal**: Enterprise solutions with agentic engineering need per-workspace AI guidance. When a repo contains multiple sub-projects (packages, services, apps), openskulls fingerprints each workspace independently and generates scoped instruction files, plus a root-level aggregate that maps the whole solution.

### A1 — Foundation (schemas, no breaking changes)

| # | Task | Status |
|---|---|---|
| A1.1 | Add `WorkspaceEntry` and `WorkspaceConfig` Zod schemas to `src/core/config/types.ts` | ✅ |
| A1.2 | Extend `ProjectConfig` with optional `workspaces: WorkspaceConfig` field | ✅ |
| A1.3 | Add `loadWorkspaceConfig(repoRoot)` helper to `src/core/config/types.ts` | ✅ |
| A1.4 | Create `src/core/fingerprint/workspace-types.ts` with `WorkspaceFingerprint` and `MonorepoAnalysis` | ✅ |
| A1.5 | Create `src/core/fingerprint/workspace-discovery.ts` — `discoverWorkspaces()`, `isWorkspaceRoot()`, `WORKSPACE_MANIFEST_FILES` | ✅ |
| A1.6 | Write tests for `workspace-discovery.ts` in `tests/workspace-discovery.test.ts` | ✅ |
| A1.7 | Create `src/core/fingerprint/workspace-cache.ts` — `loadWorkspaceFingerprint()`, `saveWorkspaceFingerprint()`, `loadAllWorkspaceFingerprints()` | ✅ |

### A2 — Core logic

| # | Task | Status |
|---|---|---|
| A2.1 | Create `src/core/fingerprint/workspace-collector.ts` — `collectWorkspaceFingerprints()`, `buildAggregateFingerprint()`, `extractCrossCuttingConventions()` | ✅ |
| A2.2 | Create `src/core/generators/workspace-aggregate.ts` — pure `buildWorkspaceMapSection()` renderer | ✅ |
| A2.3 | Add `readonly workspaceMap?: WorkspaceMapEntry[]` to `GeneratorInput` in `src/core/generators/base.ts` | ✅ |
| A2.4 | Update `ClaudeCodeGenerator.generate()` to inject `<!-- openskulls:section:workspace_map -->` when `workspaceMap` present | ✅ |
| A2.5 | Update `CopilotGenerator` to emit workspace map section | ✅ |
| A2.6 | Update `CodexGenerator` to emit workspace map section | ✅ |
| A2.7 | Write tests for `workspace-aggregate.ts` in `tests/generators/workspace-map.test.ts` | ✅ |

### A3 — CLI wiring

| # | Task | Status |
|---|---|---|
| A3.1 | Update `src/cli/commands/init.ts` — add Step 1a: workspace discovery after root analysis | ✅ |
| A3.2 | Update `init.ts` — show workspace table in UI (name, path, primary language) | ✅ |
| A3.3 | Update `init.ts` — two-pass generation: per-workspace files then root aggregate | ✅ |
| A3.4 | Update `init.ts` — save per-workspace fingerprints alongside root fingerprint | ✅ |
| A3.5 | Update `init.ts` — persist `[workspaces]` section to `config.toml` | ✅ |
| A3.6 | Update `src/cli/commands/sync.ts` interactive mode — per-workspace drift detection, selective regeneration | ✅ |
| A3.7 | Update `sync.ts` hook mode — same per-workspace logic | ✅ |

### A4 — Architect guardrails integration

| # | Task | Status |
|---|---|---|
| A4.1 | Root-level guardrails describe cross-workspace boundaries (which workspace owns which domain, cross-import rules) | ✅ |
| A4.2 | Per-workspace guardrails describe internal module boundaries only | ✅ |
| A4.3 | Pass workspace context to `buildGuardrailsPrompt()` so the AI knows about sibling workspaces | ✅ |

---

## Feature B — Preserve and Inherit Existing AI Instruction Files

**Goal**: When running `init` or `sync` on a repo that already has manually written CLAUDE.md, AGENTS.md, copilot-instructions.md, Cursor rules, or Claude skill files, openskulls must not destroy them. On first `init`, an AI call extracts existing rules and folds them into the fingerprint so generated output reflects pre-existing project knowledge.

### Key finding
`mergeSections()` already preserves foreign content verbatim — all content outside openskulls section tags survives. No new `MergeStrategy` needed. The gap is: (1) foreign knowledge isn't exploited on init, (2) unmanaged skill files aren't indexed, (3) no user-facing notice.

### B1 — Detection

| # | Task | Status |
|---|---|---|
| B1.1 | Create `src/core/fingerprint/foreign-file-types.ts` — `ForeignFileContext`, `ForeignFileScan` Zod schemas | ✅ |
| B1.2 | Create `src/core/fingerprint/foreign-file-detector.ts` — `isForeignFile()`, `scanForeignFiles()`, `detectForeignSkillFiles()` | ✅ |
| B1.3 | `isForeignFile(content)` reuses `parseChunks()` from `merge.ts` — returns true if no managed chunks found | ✅ |
| B1.4 | `scanForeignFiles(repoRoot)` checks: `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/project.mdc` | ✅ |
| B1.5 | `detectForeignSkillFiles(repoRoot)` scans `.claude/commands/*.md` for unmanaged files | ✅ |
| B1.6 | Write tests in `tests/foreign-file-detector.test.ts` using `makeContext()` factory | ✅ |

### B2 — AI-powered import

| # | Task | Status |
|---|---|---|
| B2.1 | Create `templates/prompts/foreign-file-import.md.hbs` — extraction prompt. Wrap file content in `--- FILE CONTENT ---` delimiters to prevent prompt injection | ✅ |
| B2.2 | Add `FOREIGN_FILE_IMPORT` entry to `scripts/gen-templates.ts` and regenerate `src/generated/templates.ts` | ✅ |
| B2.3 | Create `src/core/fingerprint/foreign-file-importer.ts` — `buildForeignFilePrompt()`, `importForeignFile()`, `importForeignFiles()`, `mergeForeignContextIntoQA()` | ✅ |
| B2.4 | Extracted content is stored in `qa` under keys: `foreign_file_conventions`, `foreign_file_rules`, `foreign_file_constraints` | ✅ |
| B2.5 | Write tests for pure functions in `tests/foreign-file-importer.test.ts` | ✅ |

### B3 — Generator changes

| # | Task | Status |
|---|---|---|
| B3.1 | Add `readonly foreignSkills?: readonly string[]` to `GeneratorInput` in `src/core/generators/base.ts` | ✅ |
| B3.2 | Update `ClaudeCodeGenerator` to emit `<!-- openskulls:section:foreign_skills -->` in `.claude/skills.md` when `foreignSkills` present | ✅ |
| B3.3 | Section lists each foreign skill path as a bullet: "Manually maintained — not managed by openskulls" | ✅ |

### B4 — CLI wiring

| # | Task | Status |
|---|---|---|
| B4.1 | Update `src/cli/commands/init.ts` — Step 1b: scan for foreign files after root analysis | ✅ |
| B4.2 | Update `init.ts` — Step 1c: AI import of foreign files (spinner "Importing existing AI instruction files…") | ✅ |
| B4.3 | Update `init.ts` — Step 1d: merge extracted content into `qa` seed before questionnaire | ✅ |
| B4.4 | Update `init.ts` — log notice "Found existing [file] — preserving manual content" in write step | ✅ |
| B4.5 | Update `src/cli/commands/sync.ts` — pass newly-detected `foreignSkills` into `generatorInput` | ✅ |

---

## Cross-cutting concerns

### Parallelisation
When `useSubagents = true` in `WorkflowConfig`, workspace analysis and foreign file imports should run in parallel via `Promise.allSettled`. In a large monorepo (5 workspaces × 3 foreign files = 20 AI calls) this is essential.

### Init flow (after both features)

```
Step 1:   Analyse root repo
Step 1a:  Discover workspaces (if any found)
Step 1b:  Scan for foreign AI instruction files (root + each workspace)
Step 1c:  AI import of foreign files → extract rules/conventions
Step 1d:  Merge foreign context into qa seed
Step 2:   Show detected signals (+ workspace summary if monorepo)
Step 3:   Generate AI questionnaire
Step 4:   Interviewer (static + AI questions)
Step 5:   Skills + architect + methodology (per workspace, then root)
Step 5b:  Architectural guardrails (per workspace scoped, root cross-cutting)
Step 6:   Generate + write files (root + each workspace)
Step 7:   Save fingerprints (root + per workspace)
Step 8:   Install git hook
```

### Interaction point
When discovering workspaces (Feature A), run `scanForeignFiles()` (Feature B) for each workspace before its AI analysis. Foreign extraction results enrich the per-workspace `qa` map.

---

## Implementation order

Start with the foundations of both features in parallel (they don't conflict), then wire into CLI:

1. **A1 + B1** — schemas and detection (pure, no breaking changes, fully testable)
2. **A2 + B2** — core logic (new AI builders, generator input extensions)
3. **B3** — generator foreign-skills section
4. **A3 + B4** — CLI wiring (init and sync)
5. **A4** — guardrails cross-workspace integration

---

## Future scope (not in current plan)

- `openskulls workspace add/remove` subcommands
- Turborepo/Nx/pnpm workspaces manifest as authoritative workspace source
- Cursor `.mdc` frontmatter preservation (`alwaysApply`, `globs`)
- `openskulls import-rules <file>` explicit import command
- Re-import foreign content on sync when non-managed portions have changed
- Detect GitLens, Continue.dev, Aider, Amp instruction files

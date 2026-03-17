# Platform Play: Skill Packs + AI-Generated Methodology Skills

**Date:** 2026-03-17
**Status:** Draft
**Approach:** B — Git-native packages + enhanced AI skill generation

## Problem

Static skill libraries (like superpowers) fail at scale because they're generic. A TDD skill that says "write tests first" doesn't know your project uses vitest with `makeContext()` helpers, or that generators are pure functions returning `GeneratedFile[]`. AI agents in complex projects need methodology that is grounded in the actual codebase — its architecture, conventions, test patterns, and module boundaries.

openskulls already generates project-specific *task* skills. This design extends that to project-specific *methodology* skills and adds a git-native package ecosystem so the community can share skill packs.

## Goals

1. Generate AI-powered methodology skills that encode real file paths, patterns, and conventions from the codebase
2. Ship a git-native skill pack system (`openskulls add github:user/repo`)
3. Make methodology generation context-aware of installed packs (deduplication)
4. Sprint pace — ship fast, iterate based on feedback

## Non-Goals

- Central registry (future, not now)
- Runtime enforcement of methodology (pure prompt-based, like superpowers)
- Methodology customization UI (AI generates based on fingerprint + questionnaire)

---

## 1. Git-Native Skill Packs

### Manifest Format

A skill pack is a git repo with `skull-pack.toml` at its root:

```toml
schema_version = "1.0.0"
name = "react-patterns"
description = "React conventions, hooks patterns, component architecture"
author = "someone"
tags = ["react", "frontend", "typescript"]

[applies_when]
frameworks = ["react"]
languages = ["typescript", "javascript"]

[[skills]]
id = "add-component"
path = "skills/add-component/SKILL.md"
category = "workflow"
tool_compatibility = []

[[rules]]
id = "no-class-components"
path = "rules/no-class-components.md"
section = "codeStyle"
severity = "error"
```

### CLI Commands

```bash
openskulls add github:user/repo          # install from GitHub
openskulls add github:user/repo#v1.2.0   # pin to tag/branch
openskulls add ../local/path             # install from local directory
openskulls remove react-patterns         # uninstall by pack name
openskulls list                          # show installed packs
```

### Install Flow

1. Parse source — `github:user/repo#ref` or local path
2. GitHub: `git clone --depth 1 --branch <ref>` into `.openskulls/packs/<name>/`
3. Local: symlink into `.openskulls/packs/<name>/`
4. Read and Zod-validate `skull-pack.toml`
5. Warn (not block) if `appliesWhen` doesn't match fingerprint
6. Add entry to `.openskulls/config.toml` under `[[packages]]`
7. Run `openskulls sync` to regenerate with new pack content

### File Structure

```
.openskulls/
  config.toml
  fingerprint.json
  packs/
    react-patterns/
      skull-pack.toml
      skills/
        add-component/SKILL.md
      rules/
        no-class-components.md
```

### TOML Manifest Schema

A new `SkullPackManifest` Zod schema validates the on-disk TOML format. This is distinct from the existing `SkullPackage` type (which embeds full content). The loader bridges between them.

```typescript
// src/core/packages/manifest.ts
export const ManifestSkillEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string(),                          // relative to pack root
  category: z.string().default('workflow'),
  tool_compatibility: z.array(z.string()).default([]),
})

export const ManifestRuleEntry = z.object({
  id: z.string(),
  path: z.string(),
  section: z.string().default('codeStyle'),
  severity: z.enum(['error', 'warn', 'info']).default('warn'),
})

export const SkullPackManifest = z.object({
  schema_version: z.string().default('1.0.0'),
  name: z.string(),
  description: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  applies_when: z.object({
    frameworks: z.array(z.string()).default([]),
    languages: z.array(z.string()).default([]),
  }).default({ frameworks: [], languages: [] }),
  skills: z.array(ManifestSkillEntry).default([]),
  rules: z.array(ManifestRuleEntry).default([]),
})
```

### Pack Loader (`loadInstalledPacks`)

`loadInstalledPacks(repoRoot)` in `src/core/packages/loader.ts`:

1. Glob `.openskulls/packs/*/skull-pack.toml`
2. For each manifest:
   a. Parse TOML, validate with `SkullPackManifest`
   b. For each skill entry: read `path` relative to pack root, populate `content` field
   c. For each rule entry: read `path` relative to pack root, populate `content` field
   d. Assemble into existing `SkullPackage` type (with `version: "0.0.0"` — git-native packs have no semver, ref is tracked in config)
3. Return `SkullPackage[]`

If a manifest is invalid or a referenced file is missing, log a warning and skip that pack (non-fatal).

### How Packs Feed Into Generators

- `loadInstalledPacks(repoRoot)` returns `SkullPackage[]` via the transformation above
- **v1 scope: ClaudeCodeGenerator only.** Pack skills emitted as `.claude/skills/<pack-name>-<skill-id>/SKILL.md`. Pack rules injected into CLAUDE.md context sections. Copilot/Cursor/Codex pack support deferred to v1.1.
- Generators already accept `installedPackages` in `GeneratorInput` — no interface change needed

### `.gitignore` Guidance

`.openskulls/packs/` should be added to `.gitignore` (vendor-like, large, reproducible via `openskulls add`). The `config.toml` `[[packages]]` entries are committed so teammates can run `openskulls add` to restore packs.

### Remove Flow (`openskulls remove <name>`)

1. Verify pack exists in `.openskulls/packs/<name>/`
2. Delete the pack directory (or remove symlink for local packs)
3. Remove `[[installedPacks]]` entry from `.openskulls/config.toml`
4. Run `openskulls sync` to regenerate files without the removed pack's skills/rules
5. If pack directory already gone: remove config entry, warn, continue

### Error Handling for `openskulls add`

All failures are **fatal for the add command** (not non-fatal like sync):
- `git clone` fails (network, private repo, bad ref): error message with clone stderr, exit 1
- No `skull-pack.toml` in cloned repo: "Not a valid skill pack — missing skull-pack.toml", clean up cloned dir, exit 1
- TOML validation fails: show Zod errors, clean up, exit 1
- Referenced skill/rule file missing: show which paths are missing, clean up, exit 1
- Pack with same name already installed: "Pack '<name>' already installed. Use `openskulls remove <name>` first.", exit 1

### `openskulls list` Output

Table format:
```
Name            Source                        Skills  Rules
react-patterns  github:user/react-patterns    3       1
my-local-pack   ../local/path                 2       0
```

Shows: name, original source (from config.toml), skill count, rule count.

---

## 2. AI-Generated Methodology Skills

### Skill Categories

| Skill ID | Purpose | Category | When Generated |
|---|---|---|---|
| `architect` | Boundary enforcement, feature placement, module ownership | `methodology` | Always |
| `workflow-lifecycle` | Commit conventions, documentation updates, feature lifecycle | `methodology` | Always |
| `verify` | Pre-completion checklist, CI checks, convention verification | `methodology` | Always |
| `tdd` | Test-driven development with project-specific patterns | `process` | Testing detected |
| `debug` | Systematic debugging following project data flow | `process` | 3+ modules (v1.1) |
| `decompose` | Task breakdown respecting module boundaries | `methodology` | Non-trivial architecture (v1.1) |
| `patterns` | Pattern library, canonical examples, extension points | `process` | 3+ modules (v1.1) |
| `security-review` | Stack-specific input validation, auth patterns | `security` | Web/API/DB detected (v1.1) |

### What Makes Each Skill Project-Specific

**`/architect`** — The crown jewel:
- Module map with semantic ownership (not just paths)
- Placement rules: where new features, services, types go
- Boundary contracts: how modules communicate
- Layer rules: which layers can import from which
- Extension patterns: how to add a new X following the codebase design
- Anti-patterns: specific architectural violations to avoid

**`/workflow`**:
- Commit format from `gitSignal.commitStyle` (conventional commits, Jira, etc.)
- Which docs to update when (README, CHANGELOG, Key Files table)
- Feature completion protocol referencing other methodology skills
- What "done" means in this project

**`/verify`**:
- Exact commands: `npm test`, `npm run lint`, `npm run build`
- Convention checks specific to this project
- Integration checks for cross-module changes

**`/tdd`**:
- Test framework, runner, pattern, helpers (real names)
- Real test example from the codebase
- What to mock vs use real instances
- Coverage tool and expectations

**`/debug`**:
- Architecture data flow for tracing
- Entry points and common failure points
- Logging/observability setup
- "Check Zod validation first, then trace generator pipeline"

**`/decompose`**:
- How to break features into units matching module boundaries
- Dependency order for implementation
- PR size norms

**`/patterns`**:
- Canonical code patterns with real examples
- Extension points vs coordination-required changes
- Naming conventions with real examples

**`/security`** (conditional):
- Input validation patterns for detected frameworks
- Auth/authz patterns used in this project
- Dangerous patterns specific to dependencies

### Prompt Architecture

**New template:** `templates/prompts/methodology.md.hbs`

Receives richer context than task skills. All data comes from existing fingerprint fields — no schema changes to `RepoFingerprint`:

- `fingerprint.architecture.moduleStructure` (string[]) — module paths
- `fingerprint.architecture.entryPoints` (string[]) — entry points
- `fingerprint.architecture.style` — architecture style
- `fingerprint.architecture.apiStyle` — API style if detected
- `fingerprint.architecture.database` — database if detected
- `fingerprint.testing` — framework, pattern, coverage tool
- `fingerprint.conventions` — all detected conventions
- `fingerprint.linting` — linting tools
- `fingerprint.git` — commit style, branch strategy
- `fingerprint.frameworks` — all frameworks with categories
- Questionnaire answers (`qa`) — user goals, workflow context

The AI infers semantic ownership and data flow from these signals + the module paths + the framework categories. We do NOT add new fingerprint fields — the AI is capable of inferring "src/core/generators/ owns file generation" from the path + architecture style + framework context. This is the same approach used by the existing analysis prompt.

**New builder:** `src/core/fingerprint/methodology-builder.ts`
- `buildMethodologyPrompt(fingerprint, qa, installedPackIds, taskSkills)` — pure
- `generateMethodologySkills(fingerprint, logger, qa, installedPackIds, taskSkills)` — async, invokes AI

### Conditional Generation Predicates

Concrete rules for which skills to request in the prompt:

| Skill | Predicate |
|---|---|
| `/architect` | Always |
| `/workflow` | Always |
| `/verify` | Always |
| `/tdd` | `fingerprint.testing !== undefined` |
| `/debug` | `fingerprint.architecture.moduleStructure.length >= 3` |
| `/decompose` | `fingerprint.architecture.style !== 'unknown' && fingerprint.architecture.moduleStructure.length >= 3` |
| `/patterns` | `fingerprint.architecture.moduleStructure.length >= 3` |
| `/security` | `fingerprint.architecture.apiStyle !== undefined \|\| fingerprint.architecture.database !== undefined \|\| fingerprint.frameworks.some(f => f.category === 'backend' \|\| f.category === 'frontend')` |

The prompt template uses Handlebars conditionals to include/exclude skill generation instructions based on these predicates. The AI generates only the skills requested.

### v1 Phasing

**v1.0:** Generate the 3 "always" skills (`/architect`, `/workflow`, `/verify`) plus `/tdd` when testing is detected. This covers the highest-impact methodology with minimal prompt complexity.

**v1.1:** Add conditional skills (`/debug`, `/decompose`, `/patterns`, `/security`). By then we'll have real-world feedback on methodology skill quality.

### Context-Aware Deduplication

The methodology prompt receives installed pack skill IDs and titles as a simple list:
```
Installed skills (do not duplicate):
- add-component: "Use when adding new React components..."
- no-class-components: "Enforce functional components only..."
```

The AI uses both ID and description to determine overlap. Methodology skills are structurally different from task/rule skills (they encode process, not task recipes), so collisions are rare. The main case: a pack that ships its own `/tdd` skill for a specific framework — the AI should skip generating `/tdd` if one is installed.

---

## 3. Init & Sync Flow Changes

### Init Flow (14 steps)

1. Select AI engine
2. Analyse repo
3. Show detected signals
4. Generate AI questionnaire
5. Run interviewer (static + AI questions)
6. Generate task skills (existing Phase 2)
7. **Generate methodology skills (new Phase 2b)**
8. Generate architect skill (existing, optional)
9. **Load installed packs (new)**
10. Run generators (receive task + methodology + architect + pack skills)
11. Show generation plan
12. Confirm
13. Write files
14. Install git hook

### Parallelism

When `useSubagents: true`:
- Task skills + methodology skills + architect run in parallel via `Promise.allSettled`
- Three AI calls, similar wall-clock time
- In parallel mode, `taskSkills` param is empty for methodology generation — deduplication relies only on installed pack IDs. This is acceptable because task skills and methodology skills serve different purposes and rarely overlap.

When `useSubagents: false` (default):
- Sequential: task → methodology → architect
- Methodology generation receives completed task skill IDs for cross-referencing
- Each non-fatal

### Sync Flow Changes

- Drift detected → regenerate methodology skills alongside task skills
- Installed packs: attempt `git pull` on each pack dir, re-parse manifests
  - Pull failure (network, shallow clone issues): log warning, use stale manifest, continue. Same pattern as existing hook mode (`sync.ts` always exits 0 in hook mode)
  - Invalid manifest after pull: log warning, skip pack, continue
- Updated pack IDs passed to methodology prompt for deduplication
- In hook mode: pack pull is best-effort, never blocks the commit
- If no packs installed (common case): skip pack loading entirely, pass empty `installedPackages` to generators

### Skills Index (`.claude/skills.md`)

Methodology skills flow through the existing `aiSkills` array and appear automatically in the `.claude/skills.md` index generated by `ClaudeCodeGenerator`. They appear grouped under their categories (`methodology`, `process`, `security`), separate from task skill categories. No special handling needed — the existing index generation logic handles new categories naturally.

---

## 4. File & Module Structure

### New Files

```
src/core/fingerprint/methodology-builder.ts   # generateMethodologySkills()
src/core/fingerprint/methodology-prompt.ts     # buildMethodologyPrompt()
src/core/packages/manifest.ts                  # SkullPackManifest Zod schema (TOML on-disk format)
src/core/packages/loader.ts                    # loadInstalledPacks(), installPack(), removePack()
src/cli/commands/add.ts                        # openskulls add
src/cli/commands/remove.ts                     # openskulls remove
src/cli/commands/list.ts                       # openskulls list
templates/prompts/methodology.md.hbs           # methodology prompt template
```

### Modified Files

| File | Change |
|---|---|
| `src/cli/index.ts` | Register `add`, `remove`, `list` commands |
| `src/cli/commands/init.ts` | Add methodology step, load packs, pass to generators |
| `src/cli/commands/sync.ts` | Load packs, pull updates, regenerate methodology |
| `src/core/fingerprint/skills-builder.ts` | Expand category enum with `'methodology'`, `'process'`, `'security'` |
| `src/core/generators/claude-code.ts` | Emit pack skills alongside AI skills (v1 — only generator with pack support) |
| `src/core/packages/types.ts` | Add new `InstalledPackEntry` type (see below). `PackageDependency` unchanged. |
| `templates/prompts/skills.md.hbs` | No change needed — existing category enum already excludes `methodology`/`process`/`security` |

### Category Namespace

Task skills and methodology skills share the `AISkill` type and `category` enum, but methodology skills use distinct categories (`'methodology'`, `'process'`, `'security'`). The existing task skill categories (`'workflow'`, `'testing'`, `'debugging'`, `'refactoring'`, `'documentation'`, `'devops'`, `'other'`) are reserved for task skills. The methodology skill IDs (`architect`, `workflow-lifecycle`, `verify`, `tdd`, `debug`, `decompose`, `patterns`, `security-review`) are distinct from task skill IDs by convention. Generators can filter by category if needed.

Note: The methodology `/workflow` skill uses ID `workflow-lifecycle` to avoid collision with the existing `workflow` task skill category. Its slash command becomes `/workflow-lifecycle`.

### `InstalledPackEntry` Type

Rather than modifying the shared `PackageDependency` type (used across `ProjectConfig`, `GlobalConfig`, `SkullPackage.dependencies`), a new type tracks installed packs in `config.toml`:

```typescript
// src/core/packages/types.ts
export const InstalledPackEntry = z.object({
  name: z.string(),
  source: z.enum(['github', 'local']),
  sourceUrl: z.string(),         // "github:user/repo#v1.2.0" or "../local/path"
  installedAt: z.string(),       // ISO date
})
```

In `ProjectConfig`, replace `packages: z.array(PackageDependency)` with `installedPacks: z.array(InstalledPackEntry)`. The existing `PackageDependency` type remains unchanged for its other uses (SkullPackage dependencies, global packages).

### Relationship to Existing Architect Skill

The existing `architect-builder.ts` generates a review-focused `/architect-review` skill. The new methodology `/architect` skill is a guidance skill (where to put things BEFORE coding). They are complementary:
- `/architect` (methodology): "Put new generators in `src/core/generators/`, implement `Generator` interface, register in `registry.ts`"
- `/architect-review` (existing): "Review this PR against architectural principles"

Both are retained. If `architectEnabled: false`, only the methodology `/architect` is generated (always-on). If `architectEnabled: true`, both are generated.

### Unchanged

- `types.ts` (RepoFingerprint) — no schema changes
- `ai-collector.ts` — analysis pipeline unchanged
- `merge.ts` — merge strategy unchanged
- `base.ts` — `GeneratedFile`, `Generator`, `GeneratorInput` interface unchanged (methodology skills are `AISkill[]` mixed into the existing `aiSkills` field)

### New Tests

| Test | Covers |
|---|---|
| `tests/methodology-builder.test.ts` | Prompt construction, parsing, deduplication |
| `tests/pack-loader.test.ts` | Manifest parsing, install/remove, validation |
| `tests/add-command.test.ts` | CLI integration |
| Existing generator tests | Updated for pack skill emission |

---

## 5. Strategic Position vs Superpowers

| Dimension | Superpowers | openskulls (after this) |
|---|---|---|
| Methodology skills | Static, generic, same for every repo | AI-generated, project-specific, evolve with codebase |
| Project context | None | Full fingerprint: stack, architecture, conventions |
| Skill ecosystem | None (just built-in skills) | Git-native packs, community-shareable |
| Maintenance | Manual edits | Auto-sync on drift, post-commit hook |
| Platform depth | Broad but shallow | Deep on Claude Code + Cursor + Copilot |
| Architecture enforcement | Generic "follow good practices" | Project-specific module map, boundaries, placement rules |
| Deduplication | N/A | AI avoids duplicating installed pack content |

### Deferred to v1.1+

- **Lockfile:** Existing `Lockfile` / `LockfileEntry` types in `packages/types.ts` already have `source: 'github'`. Deferred — git-native packs track source in `config.toml` `[[packages]]` entries for now. Lockfile becomes useful when we add version pinning and reproducible installs.
- **Pack support in Copilot/Cursor/Codex generators:** v1 emits pack skills only via ClaudeCodeGenerator. Other generators get pack support in v1.1.
- **Conditional methodology skills:** `/debug`, `/decompose`, `/patterns`, `/security` added in v1.1 after validating the "always" trio + `/tdd`.

### Key Differentiator

Superpowers' methodology is generic wisdom. openskulls' methodology is born from the intersection of codebase analysis + user questionnaire + installed packs. A `/tdd` skill that says "use `makeContext()` from `tests/helpers/`" beats one that says "write a failing test first."

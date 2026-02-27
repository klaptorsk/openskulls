# OpenSkulls

> Makes your repo readable to AI agents, then keeps it readable as the code evolves.

One command turns any codebase into structured AI context — `CLAUDE.md`, project skills, workflow rules — and keeps it accurate automatically as the code changes.

---

## Install

**Requires Node.js 20+**

```bash
curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh
```

The installer auto-detects bun, pnpm, or npm — whichever you already have. Or install directly:

```bash
# npm
npm install --global --no-fund --no-audit openskulls

# bun
bun add --global openskulls

# pnpm
pnpm add --global openskulls
```

---

## Update

```bash
curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh -s -- --update
```

Or directly:

```bash
npm install --global --no-fund --no-audit openskulls@latest
bun add --global openskulls@latest
pnpm add --global openskulls@latest
```

---

## Uninstall

**Remove openskulls from a specific repo** (git hook, `.openskulls/`, `.claude/`, `CLAUDE.md`):

```bash
cd your-project
openskulls uninstall
```

To keep your manual `CLAUDE.md` content and only strip the auto-generated sections:

```bash
openskulls uninstall --keep-claude-md
```

**Remove the binary from your system:**

```bash
curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/uninstall.sh | sh
```

Or directly:

```bash
npm uninstall --global openskulls
bun remove --global openskulls
pnpm remove --global openskulls
```

---

## Quick Start

```bash
cd your-project
openskulls init
```

OpenSkulls scans the repo with AI, detects your stack, asks a few workflow questions, shows you a generation plan, then writes:

- `CLAUDE.md` — structured project context for Claude Code
- `.github/copilot-instructions.md` — context for GitHub Copilot (if detected)
- `.cursor/rules/project.mdc` — context rule for Cursor (if detected)
- `AGENTS.md` — context for Codex (if detected)
- `.claude/skills.md` — project-specific AI skills overview
- `.claude/skills/` — per-skill reference documents (slash commands)
- `.claude/commands/` — built-in workflow scripts (run-tests, commit)
- `.openskulls/fingerprint.json` — baseline for drift detection
- `.openskulls/config.toml` — project configuration
- `.git/hooks/post-commit` — non-blocking auto-sync hook

---

## The Problem

Agentic engineering only works when the agent understands the codebase. Right now that understanding has to be built by hand, maintained by hand, and rebuilt whenever the code changes:

- **Context rot** — `CLAUDE.md` and `.cursorrules` go stale as the codebase evolves, so agents hallucinate based on outdated conventions
- **Blank-page problem** — new teams don't know where to start, so they don't, and agents operate without any structured context at all
- **Tool fragmentation** — a team using Claude Code + Cursor + Copilot maintains three separate context formats
- **Team inconsistency** — every developer configures their own context differently, so agents behave differently depending on who set them up

The underlying issue is that context is treated as a document you write, not a property of the codebase you derive. OpenSkulls fixes that.

---

## How It Works

OpenSkulls runs a single core loop: **analyze → generate → maintain**.

### Analyze

OpenSkulls scans the local file tree, reads key config files (`package.json`, `tsconfig.json`, `go.mod`, `pyproject.toml`, etc.), then sends a structured prompt to `claude -p` via stdin. The AI returns a `RepoFingerprint` — a rich structured snapshot of everything it detected:

- **Languages**: every language present, percentage by file count, runtime versions
- **Frameworks**: frontend, backend, fullstack, ORM, testing — detected from deps and config
- **Dependencies**: runtime vs. dev, pinned versions, source manifest
- **Conventions**: linting, formatting, package manager, commit style
- **Testing**: framework, file patterns, coverage tool
- **CI/CD**: platform (GitHub Actions, GitLab CI, etc.), deploy targets
- **Architecture**: style (monolith, monorepo, CLI, microservices), entry points, module structure
- **Git**: commit style (conventional, jira, freeform), primary branch, contributor count

The fingerprint is stored in `.openskulls/fingerprint.json` as the baseline for future drift detection. A SHA-256 content hash (excluding machine-specific paths and timestamps) makes it stable and comparable across any machine.

### Generate

From the fingerprint, OpenSkulls runs a second AI call to generate **project skills** — repo-specific slash commands tailored to the detected stack. Then the `ClaudeCodeGenerator` renders all context files.

#### `CLAUDE.md`

```markdown
# repo-name

<!-- openskulls:section:overview -->
## Project Overview
Architecture style, description, primary language and framework.
<!-- /openskulls:section:overview -->

<!-- openskulls:section:tech_stack -->
## Tech Stack
All detected languages (with percentages) and frameworks (with categories).
<!-- /openskulls:section:tech_stack -->

<!-- openskulls:section:architecture -->
## Architecture
Style, API type, database, entry points, module structure.
<!-- /openskulls:section:architecture -->

<!-- openskulls:section:conventions -->
## Conventions
Detected conventions: package manager, TypeScript config, linting tools.
<!-- /openskulls:section:conventions -->

<!-- openskulls:section:testing -->
## Testing
Framework, test file pattern, coverage tool.
<!-- /openskulls:section:testing -->

<!-- openskulls:section:cicd -->
## CI/CD
Platform and deploy targets (only when detected).
<!-- /openskulls:section:cicd -->

<!-- openskulls:section:workflow_rules -->
## Workflow Rules
Auto-documentation and auto-commit policies (from your init answers).
<!-- /openskulls:section:workflow_rules -->

<!-- openskulls:section:agent_guidance -->
## Agent Guidance
Commit format, working patterns, scope constraints.
<!-- /openskulls:section:agent_guidance -->

---

## Key Files   ← your manual section — never touched by openskulls

| Path | Purpose |
| ---- | ------- |
```

Tagged sections (`<!-- openskulls:section:* -->`) are owned by OpenSkulls and regenerated on sync. Everything outside those tags is yours — preserved permanently, including manual sections you add below.

#### `.claude/skills/`

The second AI call generates project-specific skills: slash commands with rich reference content tailored to your stack. Each skill lives at `.claude/skills/<id>/SKILL.md` with YAML frontmatter that registers it as a `/<id>` slash command in Claude Code.

```
.claude/
├── skills.md                      # overview of all AI-generated skills, grouped by category
└── skills/
    ├── add-api-endpoint/
    │   └── SKILL.md               # /add-api-endpoint
    ├── write-unit-test/
    │   └── SKILL.md               # /write-unit-test
    └── run-migration/
        └── SKILL.md               # /run-migration
```

Skills are non-fatal: if the AI call fails, `init` and `sync` continue without them.

#### `.claude/commands/`

Built-in workflow scripts are emitted automatically when conditions are met:

| File | Condition |
|------|-----------|
| `run-tests.md` | Testing framework detected (`/run-tests`) |
| `commit.md` | Conventional Commits style detected (`/commit`) |

Skills from installed packages (via `openskulls add`) are also placed here.

### Maintain

A non-blocking post-commit hook watches for drift. When dependencies change, frameworks are added, or architecture shifts — OpenSkulls detects the delta and updates context automatically. The hook never blocks a commit and never interrupts developer flow.

---

## `openskulls init [path]`

Analyse a repository and generate AI context files. Runs the full pipeline.

```bash
openskulls init                 # current directory
openskulls init ./my-service    # explicit path
openskulls init --dry-run       # preview without writing
openskulls init --yes           # skip confirmation prompts
openskulls init --verbose       # show AI prompts and raw responses
```

**Init flow:**

1. **Analyse repo** — scans file tree, reads config files, invokes `claude -p` for AI analysis
2. **Show detected signals** — languages, frameworks, testing, linting in a table
3. **Generate contextual questions** — second AI call produces repo-specific questions based on the fingerprint (non-fatal, skipped with `--yes`)
4. **Workflow setup** — static questions + AI-generated contextual questions to configure how Claude works in this repo (skipped with `--yes`)
5. **Generate project skills** — third AI call produces repo-specific slash commands, using your answers as context (non-fatal)
6. **Generate architect skill** — optional AI call that generates a domain-expert architect agent (if enabled in step 4)
7. **Generate files** — renders `CLAUDE.md` and all context files from the fingerprint
8. **Show generation plan** — lists every file that will be created or updated
9. **Confirm** — nothing is written until you approve (skipped with `--yes`)
10. **Write files** — applies merge strategy per file (see [Merge Strategy](#merge-strategy))
11. **Save baseline** — writes `.openskulls/fingerprint.json` and `.openskulls/config.toml`
12. **Install git hook** — adds `.git/hooks/post-commit` for automatic drift detection

**Verbose mode** (`--verbose` / `-v`): prints the full AI prompt and raw JSON response for every AI call — analysis, questionnaire, skills, and architect. Useful for debugging or understanding what was sent to the model.

**Workflow questions** (step 4):

All prompts use interactive arrow-key selectors — use `↑`/`↓` to navigate, `Space` to toggle (multi-select), `Enter` to confirm. Cancel any prompt with `Ctrl+C`.

| Question | Options | Default |
|---|---|---|
| AI tool(s) to configure | Claude Code, GitHub Copilot, OpenAI Codex, Cursor (multi-select) | Claude Code |
| Auto-documentation | Ask me first / Update automatically / Handle myself | Ask me first |
| Auto-commit | Ask me first / Commit automatically / Never | Ask me first |
| Architect agent | Yes / No | Yes |
| (If yes) Architect domain | Free text | auto-detect |
| Architect review trigger | Ask me first / Always / Only on `/architect-review` | Ask me first |
| Skill generation | Single AI call / Parallel subagents | Single AI call |

Answers are saved to `.openskulls/config.toml` and generate a `workflow_rules` section in `CLAUDE.md` that instructs Claude on your preferences.

### Parallel skill generation

When you choose **parallel subagents** in the workflow setup, the skills AI call and the architect AI call run simultaneously via `Promise.allSettled` instead of sequentially. This cuts generation time roughly in half when both are enabled, at the cost of two concurrent AI sessions instead of one.

Both calls are non-fatal — if either fails the other still completes and `init` continues. The setting is saved as `use_subagents = true` in `.openskulls/config.toml`.

### Architect agent

When enabled, `openskulls init` (and `openskulls sync`) runs a third AI call to generate a `/architect-review` slash command tailored to your codebase. The agent acts as a domain-expert reviewer, producing:

- **Architectural Principles** — non-negotiable rules specific to your stack
- **Review Checklist** — 6–10 items to verify on every feature or change
- **Anti-Patterns** — stack-specific patterns to flag in code review
- **Common Patterns** — canonical patterns referencing real paths in your repo

The prompt template lives at `templates/prompts/architect.md.hbs` and can be edited directly to tune output without touching TypeScript.

When `architect_review = "always"` is set in config, the generated skill includes a Workflow section that instructs Claude to run `/architect-review` as a required step after every feature addition.

---

## `openskulls sync [path]`

Update context files to match the current state of the repo. Run this after pulling changes from teammates, or when the post-commit hook reports drift.

```bash
openskulls sync                 # show diff and confirm before writing
openskulls sync --dry-run       # show what would change
openskulls sync --yes           # apply without confirmation
```

Sync detects drift by comparing the current repo's `contentHash` against the stored baseline. If the hash changed, it runs the full analysis → generate pipeline and shows exactly which sections would be updated before writing anything.

Workflow config is read from `.openskulls/config.toml` — if the architect agent was enabled during `init`, sync regenerates the `/architect-review` skill automatically.

**Hook mode** (called automatically by the post-commit hook):

```bash
openskulls sync --hook --changed "package.json\nsrc/server.ts"
```

In hook mode, OpenSkulls checks whether any changed file matches a trigger pattern. If no trigger file changed it exits immediately (fast path). All output is suppressed. The process always exits 0 — a sync failure never blocks a commit.

**Default trigger patterns:**

```
package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb
requirements*.txt, pyproject.toml, Pipfile, Pipfile.lock
go.mod, go.sum
Cargo.toml, Cargo.lock
Gemfile, Gemfile.lock
tsconfig*.json
.github/workflows/**
```

---

## `openskulls audit [path]` _(v0.2)_

Check the health of the current context against the repo. Produces a report showing:

- Stale references — packages or frameworks in context that are no longer in the dependency graph
- Missing coverage — major modules or patterns not represented in context
- Drift score — how far the current repo has moved from the fingerprint baseline

```bash
openskulls audit                # interactive report
openskulls audit --ci           # exit non-zero if drift exceeds threshold (CI gate)
openskulls audit --json         # machine-readable output
```

---

## `openskulls add <package>` _(v0.2)_

Install a skill package from the OpenSkulls registry.

```bash
openskulls add fastapi-conventions
openskulls add nextjs-fullstack
openskulls add terraform-workflow
```

Packages are versioned and pinned in `.openskulls/skulls.lock`. Skills are installed to `.claude/commands/` as plain markdown files you can read, edit, and commit.

---

## `openskulls publish [path]` _(v0.2)_

Package and publish skills and rules to the OpenSkulls registry.

```bash
openskulls publish              # publishes the current package (skulls.toml required)
openskulls publish --dry-run    # validate without publishing
```

---

## `openskulls uninstall [path]`

Remove all openskulls-generated files from a repository.

```bash
openskulls uninstall                   # shows plan then confirms
openskulls uninstall --keep-claude-md  # strip managed sections, preserve manual content
openskulls uninstall --yes             # skip confirmation
```

Removes: post-commit hook, `.openskulls/`, `.claude/`, and `CLAUDE.md` (or just its managed sections with `--keep-claude-md`). Does **not** remove the global binary — use the uninstall script for that.

---

## Merge Strategy

OpenSkulls never blindly overwrites files. Each generated file has a declared merge strategy:

| Strategy | Used for | Behaviour |
|----------|----------|-----------|
| `merge_sections` | `CLAUDE.md`, `.claude/skills.md` | Regenerates only `<!-- openskulls:section:* -->` blocks; all manual content is preserved in place |
| `replace` | `.claude/settings.json`, skill files | Overwrites the entire file |

The section merge algorithm (`src/core/generators/merge.ts`) is a pure function with no I/O:
1. Parse the existing file into alternating manual and managed chunks
2. Build a map of new managed section content
3. Rebuild: preserve manual chunks in order, replace managed sections with new versions, append any new sections

The result: multiple syncs are safe, manual edits survive, and no content is ever silently lost.

---

## Context Hierarchy

Context is not one thing. OpenSkulls enforces a clear separation between what belongs to the developer and what belongs to the project:

```
~/.claude/CLAUDE.md                    # Your identity: name, preferences, style
~/.claude/commands/                    # Personal skills: carried across every repo

[repo]/.openskulls/config.toml         # OpenSkulls project config (committed)
[repo]/.openskulls/fingerprint.json    # Drift baseline (committed)
[repo]/CLAUDE.md                       # Project context (committed)
[repo]/.claude/skills.md              # AI-generated skills overview (committed)
[repo]/.claude/skills/                # AI-generated per-skill reference docs (committed)
[repo]/.claude/commands/              # Built-in and package workflow scripts (committed)
[repo]/.claude/settings.json          # Claude Code settings (committed)
```

**Personal context** (`~/.claude/`) is never committed. It follows you across every repo.

**Project context** (`[repo]/`) is committed. Every teammate gets the same baseline after pulling.

**Team consistency** emerges naturally: when `.openskulls/config.toml` and `CLAUDE.md` are committed, every developer who pulls and runs `openskulls sync` gets the current project context.

---

## Configuration

Project configuration lives in `.openskulls/config.toml` (committed to the repo):

```toml
schema_version = "1.0.0"

[[targets]]
name = "claude_code"
enabled = true

[[targets]]
name = "cursor"
enabled = true

[workflow]
auto_docs = "ask"           # "always" | "ask" | "never"
auto_commit = "ask"         # "always" | "ask" | "never"
architect_enabled = true
architect_domain = ""       # leave blank to auto-detect
architect_review = "ask"    # "always" | "ask" | "never"
use_subagents = false       # true = run skills + architect in parallel

exclude_paths = [
  "node_modules", ".git", "dist", "build",
  ".venv", "__pycache__", ".next", ".nuxt", "coverage"
]
```

`workflow.auto_docs` and `workflow.auto_commit` are set during `openskulls init` and drive the `## Workflow Rules` section in `CLAUDE.md`. They can be changed by editing the file and re-running `openskulls sync`.

**Personal global config** lives in `~/.openskulls/config.json` (never committed):

```json
{
  "schemaVersion": "1.0.0",
  "preferredTools": ["claude_code"],
  "developerProfile": {
    "name": "",
    "preferredEditor": "",
    "codingStyleNotes": "",
    "personalRules": []
  }
}
```

---

## Drift Detection

After `openskulls init`, the fingerprint is committed to `.openskulls/fingerprint.json`. Each file in the fingerprint contributes to a SHA-256 `contentHash` (excluding `repoRoot`, `generatedAt`, and `contentHash` itself), so the hash is machine-independent — the same codebase produces the same hash anywhere.

The post-commit hook runs `openskulls sync --hook` after every commit. If a trigger-pattern file changed, it re-fingerprints the repo and compares hashes. On drift, it updates context files silently. On failure, it exits 0.

**Drift categories:**

| Category | Example trigger |
|----------|----------------|
| Dependency drift | New package added, major version bump |
| Framework drift | New framework detected in dependency graph |
| Convention drift | New linter config, formatter config changed |
| Architecture drift | New module boundary, `tsconfig.json` path change |
| CI/CD drift | New workflow file added under `.github/workflows/` |

---

## AI Analysis

The analysis pipeline (`src/core/fingerprint/ai-collector.ts`) uses Claude Code's `claude -p` subprocess via stdin — no hardcoded language parsers, no regex matching against a fixed list.

**Pipeline:**

1. Walk repo file tree (max depth 6), cataloguing ~50 known config file types
2. Read key config file contents (up to 32 KB each)
3. Detect installed AI CLI tools (by checking `$PATH` dirs for execute permission)
4. Build a structured analysis prompt from the file tree and config contents
5. Pipe prompt to `claude -p` via stdin (avoids `ARG_MAX` limits)
6. Parse and Zod-validate the JSON response
7. Compute `contentHash` and assemble the `RepoFingerprint`

Because analysis is AI-driven, OpenSkulls can detect any language, framework, or convention — not just the ones on a hardcoded list. The output is always validated against a Zod schema before use.

---

## Supported Languages & Frameworks

Because analysis is AI-powered, OpenSkulls can detect any stack. The following are reliably detected because their config files are always read:

### Languages
| Language | Version source |
|----------|---------------|
| Python | `pyproject.toml`, `.python-version` |
| JavaScript | `package.json` `engines` field |
| TypeScript | `package.json` `typescript` dep |
| Go | `go.mod` |
| Rust | `Cargo.toml` |
| Ruby | `Gemfile`, `.ruby-version` |

### Frameworks (auto-detected via deps + config)
| Category | Frameworks |
|----------|-----------|
| Full-stack | Next.js, Nuxt, Remix, SvelteKit |
| Frontend | React, Vue, Svelte, SolidJS, Angular |
| Backend (JS/TS) | Express, Fastify, Koa, Hono, NestJS, tRPC, GraphQL |
| Backend (Python) | FastAPI, Django, Flask, Starlette, Litestar, aiohttp |
| Backend (Go) | Gin, Echo, Fiber, Gorilla Mux, Chi, gRPC |
| ORM (JS/TS) | Prisma, Drizzle, Mongoose, TypeORM |
| ORM (Python) | SQLAlchemy, Tortoise ORM |
| ORM (Go) | GORM, sqlx, Bun, Ent |
| ML / Data | PyTorch, TensorFlow, HuggingFace Transformers, NumPy, Pandas |
| CLI | Cobra, Click, Typer, urfave/cli, Commander |
| Validation | Zod, Pydantic |
| Desktop | Electron, Tauri |

### Testing
| Language | Frameworks |
|----------|-----------|
| JavaScript/TypeScript | Vitest, Jest, Mocha, Playwright, Cypress |
| Python | pytest, unittest |
| Go | built-in `testing`, testify |

### Linting & Formatting
| Language | Tools |
|----------|-------|
| JavaScript/TypeScript | ESLint, Prettier, Biome, XO |
| Python | Ruff, mypy, Black, pylint, isort, flake8 |
| Go | golangci-lint, gofmt |

---

## Install From Source

```bash
git clone https://github.com/klaptorsk/openskulls
cd openskulls
npm install --no-fund --no-audit
npm run build
npm link        # makes `openskulls` available globally
```

Verify:

```bash
openskulls --version
```

Run the test suite:

```bash
npm test
```

---

## Architecture Notes

- **Generators are pure functions** — `generate(input): GeneratedFile[]` never writes to disk. The CLI layer owns all I/O. This enables dry-run, diff preview, and CI mode.
- **Zod as source of truth** — all types are `z.infer<typeof Schema>`. The same schemas validate AI responses at runtime and provide compile-time safety.
- **Stdin over CLI args** — AI prompts are written to `child.stdin` to avoid `ARG_MAX` limits on large repos.
- **Content-addressed fingerprints** — SHA-256 over content fields only (no paths, no timestamps). Same codebase = same hash on any machine, in any directory.
- **Non-blocking hooks** — the post-commit hook always exits 0. A sync failure or analysis error never interrupts a developer's commit.

For full module structure, data flow diagrams, config file schemas, and an extension guide, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Roadmap

| Version | Focus |
|---------|-------|
| **v0.1** | Core loop: `init`, `sync` — AI-powered analysis — Claude Code, Cursor, Copilot, Codex generators — workflow rules — parallel skill generation — git hook |
| **v0.2** | `openskulls audit` — `openskulls diff` — `openskulls doctor` — skill registry + `openskulls add` — AI response cache — CI mode (`--ci` flag) |
| **v0.3** | `openskulls sync --watch` — monorepo support — `openskulls skills push/pull` — plugin API — external package loading |
| **v1.0** | Platform: org-level context — agent performance metrics — multi-agent profiles |

---

## License

MIT

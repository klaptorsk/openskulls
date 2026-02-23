# OpenSkulls

> Makes your repo readable to AI agents, then keeps it readable as the code evolves.

One command turns any codebase into structured AI context — CLAUDE.md, `.cursorrules`, project skills — and keeps it accurate automatically as the code changes.

---

## Install

**Requires Node.js 20+**

```bash
# npm
npm install -g openskulls

# bun
bun add -g openskulls

# zero-install (always latest)
npx openskulls@latest init
```

**Shell one-liner** (installs via npm, with Node.js version check):

```bash
curl -fsSL https://raw.githubusercontent.com/klaptorsk/openskulls/main/install.sh | sh
```

---

## Quick Start

```bash
cd your-project
openskulls init
```

That's it. OpenSkulls scans the repo, detects your stack, asks a few questions it can't infer, shows you a preview, then writes:

- `CLAUDE.md` — structured project context for Claude Code
- `.claude/commands/` — project-specific skills (reusable agent workflows)
- `.openskulls/fingerprint.json` — the baseline for drift detection
- A post-commit git hook that keeps everything in sync

---

## The Problem

Agentic engineering only works when the agent understands the codebase. Right now that understanding has to be built by hand, maintained by hand, and rebuilt whenever the code changes:

- **Context rot** — CLAUDE.md and `.cursorrules` go stale as the codebase evolves, so agents hallucinate based on outdated conventions
- **Blank-page problem** — new teams don't know where to start, so they don't, and agents operate without any structured context at all
- **Tool fragmentation** — a team using Claude Code + Cursor + Copilot maintains three separate context formats
- **Team inconsistency** — every developer configures their own context differently, so agents behave differently depending on who set them up

The underlying issue is that context is treated as a document you write, not a property of the codebase you derive. OpenSkulls fixes that.

---

## How It Works

OpenSkulls runs a single core loop: **analyze → generate → maintain**.

### Analyze

OpenSkulls reads the repo and builds a structured fingerprint:

- **Languages**: detects every language present, the primary language by file count, and runtime versions (from `.nvmrc`, `go.mod`, `pyproject.toml`, `.python-version`, etc.)
- **Frameworks**: matches import signatures and config file patterns against a known set
- **Dependencies**: parses `package.json`, `go.mod`, `pyproject.toml`, `requirements.txt` for runtime vs dev deps
- **Conventions**: finds linter configs, formatter configs, test patterns, and commit style from git history
- **Testing**: detects framework (vitest, jest, pytest, etc.) and test file patterns
- **Architecture**: identifies module boundaries and service separation in monorepos
- **AI tool usage**: checks for existing `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`

The fingerprint is saved as `.openskulls/fingerprint.json` — the baseline for future drift detection.

### Generate

From the fingerprint, OpenSkulls writes context files tailored to each AI tool in use. For Claude Code:

```
CLAUDE.md
├── Project Overview        ← auto-generated from fingerprint
├── Tech Stack              ← languages, versions, frameworks
├── Architecture            ← module structure, service layout
├── Conventions             ← linting, formatting, test patterns
├── Agent Guidance          ← how to work with this specific codebase
└── [your manual sections]  ← untouched, always preserved
```

Before writing anything, OpenSkulls shows a **generation plan** — what files will be created or modified, and what the content will look like. Nothing is written until you confirm.

If a `CLAUDE.md` already exists, OpenSkulls merges: it regenerates only the sections it owns (tagged with `<!-- openskulls:section:* -->`) and leaves all manual content untouched.

### Maintain

A lightweight post-commit git hook watches for drift. When dependencies change, when new frameworks are adopted, when architecture shifts — OpenSkulls detects the delta and notifies you at the next terminal session. `openskulls sync` shows exactly what changed and updates only the affected sections.

The hook never blocks a commit. It never interrupts a development flow.

---

## Commands

### `openskulls init [path]`

Analyse a repository and generate AI context files. Runs the full pipeline: fingerprint → interview → generate plan → write files → install git hook.

```bash
openskulls init                 # current directory
openskulls init ./my-service    # explicit path
openskulls init --dry-run       # preview without writing
openskulls init --yes           # skip confirmation prompts
openskulls init -t claude_code cursor  # target specific tools
```

**What it detects automatically** (no input required):
- Languages, runtime versions, primary language
- Frameworks and libraries from dependency manifests
- Test framework and test file patterns
- Linter and formatter config
- Package manager (npm / pnpm / yarn / bun)
- Existing AI tool config files

**What it asks** (only when inference fails):
1. Which AI tools should context be generated for?
2. What is the primary purpose of this codebase? (one sentence)
3. Is this for a solo developer, small team, or open-source contributors?
4. Any conventions that live in someone's head and not in a config file? (optional)

---

### `openskulls sync`

Update context files to match the current state of the repo. Run this after pulling changes from teammates, or when the post-commit hook reports drift.

```bash
openskulls sync                 # show diff and confirm before writing
openskulls sync --dry-run       # show what would change
openskulls sync --yes           # apply without confirmation
```

Sync regenerates only the sections it owns. Manual content is always preserved.

---

### `openskulls audit`

Check the health of the current context against the repo. Produces a context health report showing:

- Stale references (packages or frameworks mentioned in context that are no longer in the dependency graph)
- Missing coverage (major modules or patterns not represented in context)
- Drift score (how far the current repo has moved from the fingerprint baseline)

```bash
openskulls audit                # interactive report
openskulls audit --ci           # exit non-zero if drift exceeds threshold (CI gate)
openskulls audit --json         # machine-readable output
```

---

### `openskulls add <package>` _(v0.2)_

Install a skill package from the OpenSkulls registry.

```bash
openskulls add fastapi-conventions
openskulls add nextjs-fullstack
openskulls add terraform-workflow
```

Packages are versioned and pinned in `.openskulls/skulls.lock`. Skills are installed to `.claude/commands/` as plain markdown files you can read, edit, and commit.

---

### `openskulls publish` _(v0.2)_

Package and publish a set of skills and rules to the OpenSkulls registry.

```bash
openskulls publish              # publishes the current package (skulls.toml required)
openskulls publish --dry-run    # validate without publishing
```

---

## What Gets Generated

### CLAUDE.md

The generated `CLAUDE.md` is structured, dense, and agent-optimised. Example output for a TypeScript + Next.js project:

```markdown
# Project Context

<!-- openskulls:section:overview -->
This is a Next.js 14 full-stack application using TypeScript in strict mode.
Primary language: TypeScript (94%). Runtime: Node.js 20.
<!-- /openskulls:section:overview -->

<!-- openskulls:section:stack -->
## Tech Stack
- **Framework**: Next.js 14.2 (App Router)
- **Language**: TypeScript 5.5, strict mode
- **ORM**: Prisma 5.0
- **Testing**: Vitest, pattern `**/*.test.ts`
- **Linting**: ESLint + Prettier (eslint.config.js)
- **Package manager**: pnpm
<!-- /openskulls:section:stack -->

<!-- openskulls:section:conventions -->
## Conventions
- Tests live alongside source files as `*.test.ts`
- Use `pnpm` for all package operations, never npm
- ESLint config is flat format (eslint.config.js)
- TypeScript strict mode is enforced — no `any`, no non-null assertions
<!-- /openskulls:section:conventions -->

## Architecture  ← manually authored, never touched by openskulls

...your notes here...
```

Tagged sections (`<!-- openskulls:section:* -->`) are regenerated on sync. Everything outside the tags is yours.

### .claude/commands/

Project skills are installed as plain markdown files in `.claude/commands/`. Each skill is a named, reusable workflow the agent can execute on demand:

```
.claude/commands/
├── add-api-endpoint.md     # steps to add a REST endpoint for this specific stack
├── add-migration.md        # database migration workflow
├── run-tests.md            # how to run and interpret tests in this repo
└── review-pr.md            # code review checklist for this codebase
```

Skills are generated based on the detected stack and can be used with `/add-api-endpoint` in Claude Code.

---

## Context Hierarchy

Context is not one thing. OpenSkulls enforces a clear separation between what belongs to the developer and what belongs to the project:

```
~/.claude/CLAUDE.md                    # Your identity: name, preferences, style
~/.claude/commands/                    # Personal skills: carried across every repo

[repo]/.openskulls/config.toml         # OpenSkulls config (committed)
[repo]/.openskulls/fingerprint.json    # Drift baseline (committed)
[repo]/CLAUDE.md                       # Project context (committed)
[repo]/.claude/commands/               # Project skills (committed)
[repo]/.claude/settings.json           # Claude Code settings + hook config (committed)
[repo]/.cursorrules                    # Cursor rules (committed, if Cursor in use)
```

**Personal context** (`~/.claude/`) is never committed. It follows you across every repo.

**Project context** (`[repo]/`) is committed. Every teammate gets the same baseline after pulling.

**Team consistency** emerges naturally: when `.openskulls/config.toml` and `CLAUDE.md` are committed, every developer who runs `openskulls sync` gets the current project context.

---

## Supported Languages & Frameworks

### Languages
| Language   | Version detection | Source    |
|------------|------------------|-----------|
| Python     | ✓ | `pyproject.toml`, `.python-version` |
| JavaScript | ✓ | `package.json`, `engines` field |
| TypeScript | ✓ | `package.json` (`typescript` dep) |
| Go         | ✓ | `go.mod` |

### Frameworks (auto-detected)
| Category   | Frameworks |
|------------|-----------|
| Full-stack | Next.js, Nuxt, Remix |
| Frontend   | React, Vue, Svelte, SolidJS, Angular |
| Backend (JS) | Express, Fastify, Koa, Hono, NestJS, tRPC, GraphQL |
| Backend (Python) | FastAPI, Django, Flask, Starlette, Litestar, aiohttp |
| Backend (Go) | Gin, Echo, Fiber, Gorilla Mux, Chi, gRPC |
| ORM (JS)   | Prisma, Drizzle, Mongoose, TypeORM |
| ORM (Python) | SQLAlchemy, Tortoise ORM |
| ORM (Go)   | GORM, sqlx, Bun, Ent |
| ML/Data    | PyTorch, TensorFlow, HuggingFace Transformers, NumPy, Pandas |
| CLI        | Cobra, Click, Typer, urfave/cli |
| Validation | Zod, Pydantic |
| Desktop    | Electron |

### Testing
| Language | Frameworks |
|----------|-----------|
| JavaScript/TypeScript | Vitest, Jest, Mocha, Playwright, Cypress |
| Python | pytest, unittest |

### Linting & Formatting
| Language | Tools |
|----------|-------|
| JavaScript/TypeScript | ESLint, Prettier, Biome, XO |
| Python | Ruff, mypy, Black, pylint, isort, flake8 |

---

## Configuration

Project configuration lives in `.openskulls/config.toml` (committed to the repo):

```toml
# .openskulls/config.toml

[project]
name = "my-service"
description = "A REST API for managing user accounts"
audience = "team"          # solo | team | open-source

[tools]
targets = ["claude_code"]  # claude_code | cursor | copilot | cline

[sync]
auto_sections = ["overview", "stack", "conventions"]
preserve_sections = ["architecture", "agent-guidance"]

[hooks]
post_commit = true         # enable non-blocking post-commit drift check
```

---

## Drift Detection

After `openskulls init`, the repo fingerprint is committed to `.openskulls/fingerprint.json`. The post-commit hook compares the current repo state to this baseline after every commit.

Drift categories:

| Category | Trigger |
|----------|---------|
| Dependency drift | Package added, removed, or major version bump |
| Convention drift | New linter config, formatter config changed |
| Framework drift | New framework detected in dep graph |
| Architecture drift | New module boundary or service introduced |

When drift is detected, `openskulls sync` shows a structured diff:

```
openskulls sync

  Drift detected since last sync (3 changes):

  + tailwindcss@3.4.0 added to dependencies
  + @tanstack/react-query@5.0.0 added to dependencies
  ~ typescript 5.4 → 5.5

  Sections that would be updated:
    CLAUDE.md > stack
    CLAUDE.md > conventions

  Proceed? [y/N]
```

---

## Install From Source

```bash
git clone https://github.com/klaptorsk/openskulls
cd openskulls
npm install
npm run build
npm link        # makes `openskulls` available globally
```

Verify:

```bash
openskulls --version
```

---

## Roadmap

| Version | Focus |
|---------|-------|
| **v0.1** | Core loop: `init`, `sync`, `audit` — Python, JS, TS, Go — Claude Code generator |
| **v0.2** | Multi-tool: Cursor, Cline, Copilot — Rust, Java, Ruby — skill registry + `openskulls add` |
| **v0.3** | Feedback loop: `openskulls refine` — skill composition — CI mode — plugin API |
| **v1.0** | Platform: org-level context — agent performance metrics — multi-agent profiles |

---

## License

MIT

# OpenSkulls

## Vision

OpenSkulls makes your repo readable to AI agents, then keeps it readable as the code evolves.
One command turns any codebase into a well-structured context that any agentic tool can reason about — and it stays accurate without manual effort.

---

## The Problem

Agentic engineering only works when the agent understands the codebase. Right now, that understanding has to be built by hand, maintained by hand, and rebuilt whenever the code changes. The result:

- **Context rot**: the codebase evolves but CLAUDE.md, .cursorrules, and skill files do not. Agents start hallucinating based on stale conventions.
- **Rules that were never verified**: written once in a burst of optimism, never tested against real agent behavior.
- **Token waste**: bloated context files full of outdated or irrelevant rules that consume budget without improving output.
- **Team inconsistency**: every developer configures their own context differently, so agents behave differently depending on who set them up.
- **The blank-page problem**: new teams don't know where to start, so they don't start, and agents operate without any structured context at all.
- **Tool fragmentation**: a team using Claude Code and Cursor and Copilot has to maintain three separate context formats by hand.

The underlying issue is that context is treated as a document you write, not a property of the codebase you derive. OpenSkulls fixes that.

---

## What OpenSkulls Does

OpenSkulls has a single core loop: **analyze, generate, maintain**.

**Analyze**: OpenSkulls reads the repo — not just file extensions, but import graphs, framework signatures, test patterns, CI configuration, and commit history — and builds a structured fingerprint of the codebase. It detects what it can infer automatically and asks only about what it cannot.

**Generate**: From the fingerprint, OpenSkulls writes context files tailored to the AI tools in use. A CLAUDE.md for Claude Code. A .cursorrules for Cursor. A config for Cline or Copilot or Continue. The content is the same; the format is right for each tool. No manual translation.

**Maintain**: A git hook watches for drift. When dependencies change, when new patterns emerge, when architecture shifts, OpenSkulls detects the delta and updates only the sections it owns — leaving any manual edits untouched. The developer never has to think about context maintenance.

The test of whether this works: a developer clones a repo they have never seen, runs `openskulls init`, and an agent can write a non-trivial contribution without asking five clarifying questions.

---

## The Context Hierarchy

Context is not one thing. Some context belongs to the developer, some to the project, some to the team. Conflating these causes either under-sharing (agents missing project conventions) or over-sharing (personal preferences leaking into the repo). OpenSkulls enforces a clear hierarchy:

```
~/.claude/CLAUDE.md                    # Developer identity: your name, your preferences, your style
~/.claude/commands/                    # Personal skills: reusable workflows you carry across every repo

[repo]/.openskulls/config.toml         # OpenSkulls config for this project (committed)
[repo]/.openskulls/fingerprint.json    # Analysis baseline for drift detection (committed)
[repo]/CLAUDE.md                       # Project context: stack, architecture, conventions (committed)
[repo]/.claude/commands/               # Project skills: workflows specific to this codebase (committed)
[repo]/.claude/settings.json           # Claude Code settings including git hooks (committed)
[repo]/.cursorrules                    # Cursor rules (committed, if Cursor is in use)
```

**Personal context** (the `~/.claude/` layer) is never committed. It represents the developer's identity and follows them across every repo they work in.

**Project context** (the `[repo]/` layer) is committed. It represents what every agent working on this codebase needs to know, regardless of who is running the agent.

**Team context** emerges naturally: when `.openskulls/config.toml` and `CLAUDE.md` are committed, every teammate gets the same baseline after pulling. `openskulls sync` brings a teammate's local setup up to date in one command.

This hierarchy is the answer to "what goes where" — and it is enforced, not just documented.

---

## The Initialize Workflow

`openskulls init` runs once per repo. It is the entry point for everything.

### What happens automatically (no user input required)

1. **Detect languages and runtimes**: identify every language present, the primary language by file count and import volume, and the runtime versions in use (from `.nvmrc`, `pyproject.toml`, `go.mod`, etc.).
2. **Detect frameworks**: match import signatures and config file patterns against a known set (Django, FastAPI, Next.js, Express, Gin, Rails, etc.).
3. **Detect infrastructure**: read `docker-compose.yml`, Kubernetes manifests, CI config (GitHub Actions, CircleCI, etc.), and deployment scripts to understand the operational environment.
4. **Detect conventions**: scan for linter configs (`.eslintrc`, `ruff.toml`, `golangci.yml`), formatter configs, test patterns (test file naming, assertion libraries), and commit message patterns from git log.
5. **Detect architecture shape**: identify module boundaries, service boundaries (in monorepos), the relationship between packages, and any established design patterns.
6. **Detect AI tool usage**: check for existing CLAUDE.md, `.cursorrules`, `.github/copilot-instructions.md`, and similar files to understand what tools are already in use.

### What requires user input (asked only when inference fails)

OpenSkulls detects first and asks only what it cannot infer. The interview is short:

- Which AI tools should OpenSkulls generate context for? (shown as a checklist of detected tools plus any others)
- What is the primary purpose of this codebase? (a brief free-text description — used to frame the CLAUDE.md overview)
- Is this context intended for a solo developer, a small team, or open-source contributors? (determines default sharing and scope)
- Any conventions that live in someone's head and not in any config file? (optional — can be skipped)

### What happens before writing any files

OpenSkulls shows a **generation plan**: a summary of what files will be created or modified, what sections will be generated, and what the generated CLAUDE.md will contain at a structural level. The developer reviews and confirms before anything is written.

If a CLAUDE.md already exists, OpenSkulls merges — it regenerates only the sections it owns (marked with generation tags) and leaves any manually authored sections untouched.

---

## Living Context

The biggest problem with handwritten context is that it goes stale. OpenSkulls solves this with a maintenance loop that runs without interrupting the developer.

### The Fingerprint

At init time, OpenSkulls writes `.openskulls/fingerprint.json` — a structured snapshot of the codebase's detected properties: dependencies, architecture shape, detected conventions, framework versions. This is the baseline.

### The Git Hook

`openskulls init` installs a non-blocking post-commit hook. After each commit, the hook runs a lightweight drift check in the background. If it detects meaningful drift from the fingerprint, it queues a sync notification for the next terminal session.

The hook never blocks a commit. It never interrupts the developer mid-task.

### Drift Detection

Drift is detected by comparing the current repo state against the fingerprint. Categories of drift:

- **Dependency drift**: a package was added, removed, or significantly updated
- **Convention drift**: a new linter config appeared, or an existing one changed significantly
- **Architecture drift**: a new module or service boundary was introduced
- **Framework drift**: a new framework was adopted in a part of the codebase

When drift is detected, `openskulls sync` shows exactly what changed, what context sections would be updated, and why — then asks for confirmation before writing.

### The Feedback Loop

When an agent fails on a task in a predictable way (a pattern the developer recognizes), `openskulls refine` captures a description of the failure, extracts the implied missing rule, drafts a rule addition, and runs the task again. Over time, this closes the loop between "agent gets it wrong" and "context gets updated."

### The Audit

`openskulls audit` produces a context health score: how well the current CLAUDE.md and skills reflect the current state of the repo. It checks for stale references, missing coverage of major modules, contradictory rules, and unused skills. The score is a signal, not a grade — it tells the developer where to focus.

---

## Skill Composition and the Registry

### What Skills Are

A skill is a reusable, named workflow that an agent can execute. It is plain markdown — no DSL, no custom syntax. A skill for "add a REST endpoint" in a Django project describes the steps: create the view, register the URL, write the test, update the API docs. An agent given this skill does not have to infer the pattern; it follows the recipe.

Skills live in `.claude/commands/` (project-scoped, committed) or `~/.claude/commands/` (personal, never committed).

### Skill Composition

Skills can reference other skills. A "ship a feature" skill can compose "write the tests", "update the changelog", and "update CLAUDE.md with any new patterns introduced". This is the skill graph: a directed graph where complex workflows are assembled from smaller, tested, reusable pieces.

### The Registry

The registry is the ecosystem play. Developers publish skills as packages. A Python/FastAPI team can pull a `fastapi-conventions` package that includes REST endpoint skills, error handling rules, and a test fixture pattern — all pre-authored for their stack.

Registry packages are versioned and pinned in a lockfile (`.openskulls/skulls.lock`), mirroring npm semantics. Updates are explicit and auditable. Packages that are no longer used can be removed cleanly.

Publishing a package is how teams share accumulated agentic engineering knowledge across repos and across organizations.

---

## Developer Experience Principles

These principles govern every design decision in OpenSkulls:

**Detect first, ask minimally.** Every question asked during init represents something that could not be inferred. The goal is to ask as few questions as possible — ideally none — for a well-structured repo.

**Show before writing.** Before OpenSkulls writes or modifies any file, it shows the developer exactly what will change and why. Nothing happens silently. Everything is reversible.

**Merge, never overwrite.** OpenSkulls owns the sections it generates; the developer owns everything else. Manual edits are always preserved. Generated sections are marked so they can be regenerated without touching the rest.

**Personal stays personal.** Developer identity — coding preferences, personal skill shortcuts, individual style — lives in `~/.claude/` and is never committed to any repo. A teammate pulling the repo gets the project context, not your personal context.

**Non-blocking maintenance.** The git hook is async. It never interrupts a commit, a test run, or a development flow. Drift notifications appear when the developer is ready to see them.

**Plain text, always.** Skills and rules are markdown files. They can be read, edited, diffed, and reviewed in any editor without any tooling. No proprietary formats.

**Transparency over magic.** The audit command, the drift report, the generation plan — these exist because the developer should always be able to see what OpenSkulls knows, why it generated what it generated, and what it would change next.

---

## MVP Scope (v0.1)

The MVP proves the core loop works end-to-end for one tool and a small set of languages. Scope is ruthlessly constrained so the proof point is real and testable.

**Commands**: `init`, `sync`, `audit`

**Analyzers**: Python, JavaScript, TypeScript, Go. Each analyzer detects: language version, primary framework (one level deep), test pattern, linter config.

**Generators**: Claude Code only (writes CLAUDE.md and `.claude/commands/`). Other tool generators are stubs.

**Context sections in generated CLAUDE.md**: Stack (languages, frameworks, runtime), Architecture (module structure, service boundaries if any), Conventions (linter rules, test patterns, commit style), Agent Guidance (what the agent should know about how this team works).

**Drift detection**: dependency drift only (checks for changes in package manifests against the fingerprint).

**Registry**: not included. `openskulls add` and `openskulls publish` are stubbed with a "coming in v0.2" message.

**Success criterion**: a developer clones an unfamiliar Python or TypeScript repo, runs `openskulls init`, and an agent produces a correct, idiomatic contribution without asking clarifying questions about project structure or conventions.

---

## Roadmap

### v0.1 — The Core Loop
- `init`, `sync`, `audit` commands
- Analyzers: Python, JavaScript, TypeScript, Go
- Generator: Claude Code (CLAUDE.md + project skills)
- Drift detection: dependency drift
- Merge strategy: tagged section regeneration, preserves manual content
- Non-blocking post-commit hook
- Context hierarchy enforced: personal vs project

### v0.2 — Multi-Tool and Team Workflow
- Generators: Cursor, Cline, Copilot, Continue, Aider
- Analyzer coverage: Rust, Java, Ruby; monorepo support
- Registry client: install and pin packages from a public registry
- `openskulls add <package>` and skulls.lock
- `openskulls sync` — teammates pull and align context in one command
- Expanded drift detection: convention drift, framework drift
- Context health score with actionable output

### v0.3 — The Feedback Loop and Skill Graph
- `openskulls refine` — capture agent failure patterns and draft rule updates
- Skill composition: skills can reference and compose other skills
- Skill graph visualization: show the dependency tree of a workflow skill
- `openskulls publish` — package and publish skills to the registry
- CI mode: `openskulls audit --ci` exits non-zero on significant drift (gates deployment on context health)
- Plugin API: third-party analyzers and generators via Python entry_points

### v1.0 — The Platform
- Registry governance: versioning, ownership, deprecation
- Organization-level context: shared baseline pushed to all repos in an org
- Agent performance metrics: track whether context changes correlate with improved agent output
- Multi-agent support: context profiles for different agent roles (code reviewer, architect, tester)
- Full language coverage for all major stacks
- IDE integrations surfacing audit results and sync status inline

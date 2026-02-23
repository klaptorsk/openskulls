# OpenSkulls — Technical Implementation Plan

> This document is the technical specification for building OpenSkulls.
> For the product vision, goals, and roadmap see [PLAN.md](./PLAN.md).

---

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | Python 3.12+ | Richest ecosystem for config parsing and multi-language AST analysis |
| CLI framework | Typer | Auto-completion, clean command structure, type-safe |
| Terminal UI | Rich | Tables, progress bars, syntax-highlighted diffs, panels |
| Data models | Pydantic v2 | JSON serialization, schema generation, runtime validation for free |
| Template engine | Jinja2 | Mature, flexible, the standard for generating structured text |
| AST parsing | tree-sitter | Language-agnostic, bindings for all target languages |
| Distribution | pipx | Single install command, isolated environment, no runtime conflicts |
| Binary builds | PyInstaller (future) | Zero-dependency binary for users who don't use Python |

---

## Module Architecture

```
openskulls/
│
├── cli/                          # Typer app — command routing only, no logic
│   ├── __init__.py               # app = typer.Typer(), register all commands
│   ├── init.py                   # openskulls init
│   ├── sync.py                   # openskulls sync
│   ├── audit.py                  # openskulls audit
│   ├── add.py                    # openskulls add <package>
│   └── publish.py                # openskulls publish
│
├── core/
│   ├── fingerprint/              # Repo analysis subsystem
│   │   ├── models.py             # RepoFingerprint and all signal types (Pydantic)
│   │   ├── collector.py          # Orchestrates analyzers, merges results, computes hash
│   │   └── cache.py              # Load/save fingerprint.json, hash-based change detection
│   │
│   ├── analyzers/                # Plugin-based analysis — stateless pure functions
│   │   ├── base.py               # BaseAnalyzer ABC, AnalyzerContext, AnalyzerResult
│   │   ├── registry.py           # Discover analyzers via entry_points
│   │   ├── language/
│   │   │   ├── python.py         # pyproject.toml, setup.py, requirements.txt
│   │   │   ├── javascript.py     # package.json, .nvmrc
│   │   │   ├── typescript.py     # tsconfig.json, layered on top of javascript.py
│   │   │   └── go.py             # go.mod, go.sum
│   │   ├── framework/
│   │   │   ├── fastapi.py
│   │   │   ├── django.py
│   │   │   ├── nextjs.py
│   │   │   ├── react.py
│   │   │   └── express.py
│   │   ├── infra/
│   │   │   ├── docker.py         # docker-compose.yml, Dockerfile
│   │   │   ├── github_actions.py # .github/workflows/
│   │   │   └── gitlab_ci.py      # .gitlab-ci.yml
│   │   └── conventions/
│   │       ├── git_commits.py    # Scan git log for commit style
│   │       ├── testing.py        # Test file patterns, assertion libraries
│   │       └── linting.py        # eslint, ruff, golangci, prettier configs
│   │
│   ├── generators/               # Context file output — stateless pure functions
│   │   ├── base.py               # BaseGenerator ABC, GeneratedFile model
│   │   ├── registry.py           # Discover generators via entry_points
│   │   ├── claude_code.py        # CLAUDE.md + .claude/commands/ + settings.json
│   │   ├── cursor.py             # .cursorrules / .cursor/rules/
│   │   ├── cline.py              # .clinerules
│   │   ├── copilot.py            # .github/copilot-instructions.md
│   │   ├── continue_.py          # .continue/config.json
│   │   └── aider.py              # .aider.conf.yml
│   │
│   ├── packages/                 # Package ecosystem
│   │   ├── models.py             # SkullPackage, Skill, Rule (Pydantic)
│   │   ├── resolver.py           # Semver dependency resolution
│   │   ├── installer.py          # Install/remove packages, write skulls.lock
│   │   ├── registry_client.py    # HTTP client for openskulls registry API
│   │   └── local_loader.py       # Load packages from local filesystem paths
│   │
│   ├── hooks/                    # Git hook management
│   │   ├── installer.py          # Install/uninstall hooks into .git/hooks/
│   │   ├── handlers.py           # post-commit and post-merge event handlers
│   │   └── templates/
│   │       ├── post-commit       # Shell script template (calls openskulls sync --hook)
│   │       └── post-merge        # Shell script template
│   │
│   ├── audit/                    # Drift detection subsystem
│   │   ├── engine.py             # Orchestrates checks, produces DriftReport
│   │   ├── checks/
│   │   │   ├── dependency_drift.py     # New/removed/changed deps vs fingerprint
│   │   │   ├── convention_drift.py     # Linter/formatter config changes
│   │   │   ├── architecture_drift.py   # New modules or service boundaries
│   │   │   ├── stale_skills.py         # Skills referencing non-existent paths
│   │   │   └── conflict_check.py       # Contradictory rules in installed packages
│   │   └── report.py             # DriftReport model, Rich rendering
│   │
│   └── config/
│       ├── models.py             # ProjectConfig, GlobalConfig (Pydantic)
│       ├── loader.py             # Load and merge global + project config
│       └── interviewer.py        # Rich-powered init interview flow
│
├── templates/                    # Jinja2 templates for all output files
│   ├── claude_code/
│   │   ├── CLAUDE.md.j2
│   │   ├── command.md.j2         # Individual skill/command files
│   │   └── settings.json.j2
│   ├── cursor/
│   │   └── cursorrules.j2
│   ├── cline/
│   │   └── clinerules.j2
│   └── copilot/
│       └── copilot-instructions.j2
│
└── py.typed                      # PEP 561 marker
```

---

## Core Data Models

### RepoFingerprint

The central data structure. Everything that OpenSkulls learns about a repo is encoded here. All generators consume it. No generator reads the filesystem directly.

```python
# core/fingerprint/models.py

class Confidence(str, Enum):
    HIGH   = "high"    # Definitive config file found and parsed
    MEDIUM = "medium"  # Inferred from multiple converging signals
    LOW    = "low"     # Single weak signal

class LanguageSignal(BaseModel):
    name: str                        # "TypeScript"
    version: Optional[str]           # "5.3.2" if detectable
    confidence: Confidence
    percentage: float                # % of non-test source files
    primary: bool
    evidence: list[str]              # ["tsconfig.json found", "94 .ts files"]

class FrameworkSignal(BaseModel):
    name: str                        # "Next.js"
    version: Optional[str]
    confidence: Confidence
    category: str                    # "frontend" | "backend" | "fullstack" | "testing"
    evidence: list[str]

class ConventionSignal(BaseModel):
    name: str                        # "conventional_commits"
    value: Optional[str]             # The detected pattern
    confidence: Confidence
    evidence: list[str]

class ArchitectureSignal(BaseModel):
    style: str                       # "monorepo" | "monolith" | "microservices" | "library"
    entry_points: list[str]          # ["src/index.ts", "main.py"]
    module_structure: list[str]      # Top-level significant directories
    api_style: Optional[str]         # "rest" | "graphql" | "grpc" | "trpc"
    database: Optional[str]
    has_migrations: bool

class RepoFingerprint(BaseModel):
    schema_version: str = "1.0.0"
    generated_at: datetime
    repo_root: str                   # Absolute path — not committed
    repo_name: str

    languages:    list[LanguageSignal]
    frameworks:   list[FrameworkSignal]
    conventions:  list[ConventionSignal]
    architecture: ArchitectureSignal
    testing:      Optional[TestingSignal]
    cicd:         Optional[CICDSignal]
    linting:      Optional[LintingSignal]
    git:          Optional[GitSignal]

    # Computed shortcuts for generators
    primary_language:  Optional[str]
    primary_framework: Optional[str]

    # Stable hash — used for drift detection
    content_hash: str                # SHA256 of serialized fingerprint (minus this field)
```

**This model is the contract between analyzers and generators. It must be designed and frozen before any other module is written.**

---

### SkullPackage

The distributable unit of skills and rules.

```python
# core/packages/models.py

class Skill(BaseModel):
    id: str                          # "commit", "review-pr"
    name: str
    description: str
    content: str                     # Plain markdown — the skill file content
    tags: list[str] = []
    depends_on: list[str] = []       # Other skill IDs this one composes
    tool_compatibility: list[str] = []  # [] = all tools

class Rule(BaseModel):
    id: str
    name: str
    description: str
    content: str                     # The rule text
    severity: str = "warn"           # "error" | "warn" | "info"
    section: str = "code_style"      # Which CLAUDE.md section it belongs to
    tags: list[str] = []
    tool_compatibility: list[str] = []

class SkullPackage(BaseModel):
    schema_version: str = "1.0.0"
    name: str                        # "@openskulls/react" or "@company/standards"
    version: str                     # Strict semver
    description: str
    tags: list[str] = []

    # Auto-install signal: which repos should get this package suggested?
    applies_when: dict = {}          # {"frameworks": ["React"], "languages": ["TypeScript"]}

    skills: list[Skill] = []
    rules:  list[Rule] = []

    # Additional context sections injected into generated CLAUDE.md
    context_sections: dict[str, str] = {}

    dependencies:      list[PackageDependency] = []
    peer_dependencies: list[PackageDependency] = []
```

---

### ProjectConfig

OpenSkulls' own configuration for a repo. Stored at `[repo]/.openskulls/config.toml`. Committed.

```python
# core/config/models.py

class ProjectConfig(BaseModel):
    schema_version: str = "1.0.0"
    packages:  list[PackageDependency] = []   # Installed packages
    targets:   list[ToolTarget] = []          # Which AI tools to generate for
    sync:      SyncConfig = SyncConfig()
    exclude_paths: list[str] = [
        "node_modules", ".git", "dist", "build", ".venv", "__pycache__"
    ]
    fingerprint_overrides: dict = {}          # Correct any mis-detected signals

class GlobalConfig(BaseModel):
    schema_version: str = "1.0.0"
    registry_url: str = "https://registry.openskulls.dev"
    auth_token: Optional[str] = None
    preferred_tools: list[str] = []
    global_packages: list[PackageDependency] = []
```

---

## Analyzer Architecture

### The Contract

Analyzers are **stateless pure functions**. They receive a read-only context, return results, never write to disk, and are independently unit-testable.

```python
# core/analyzers/base.py

class AnalyzerContext(BaseModel):
    repo_root: Path
    file_tree: list[Path]                      # All non-excluded files
    config_files: dict[str, Path]              # Filename -> path for known config files
    existing_fingerprint: Optional[RepoFingerprint]  # Previous run for incremental analysis

class AnalyzerResult(BaseModel):
    analyzer_id: str
    languages:   list[LanguageSignal] = []
    frameworks:  list[FrameworkSignal] = []
    conventions: list[ConventionSignal] = []
    testing:     Optional[TestingSignal] = None
    cicd:        Optional[CICDSignal] = None
    linting:     Optional[LintingSignal] = None
    architecture_patches: dict = {}
    git_patches:          dict = {}

class BaseAnalyzer(ABC):
    TRIGGER_FILES:    list[str] = []   # Skip this analyzer if none of these exist
    TRIGGER_PATTERNS: list[str] = []   # Glob patterns as alternative triggers
    PRIORITY:         int = 50         # Lower runs first; language analyzers use 0-10

    @abstractmethod
    def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult: ...

    def can_run(self, ctx: AnalyzerContext) -> bool:
        return any(f in ctx.config_files for f in self.TRIGGER_FILES)
```

### Plugin Discovery

Third-party analyzers register via Python `entry_points` in their `pyproject.toml`:

```toml
[project.entry-points."openskulls.analyzers"]
laravel = "openskulls_laravel:LaravelAnalyzer"
```

The `AnalyzerRegistry` discovers these at startup via `importlib.metadata.entry_points(group="openskulls.analyzers")`. No changes to core are ever required to add a new language or framework.

### The Collector

`FingerprintCollector` runs all eligible analyzers (sorted by `PRIORITY`), merges their `AnalyzerResult` objects via a defined merge strategy, computes `primary_language` and `primary_framework` by confidence weighting, and returns a single `RepoFingerprint`.

---

## Generator Architecture

### The Contract

Generators are also **stateless pure functions**. They receive the fingerprint plus installed packages and return a list of `GeneratedFile` objects. They **never write to disk directly**. The CLI layer handles writing, diffing, and user confirmation.

```python
# core/generators/base.py

class GeneratedFile(BaseModel):
    relative_path: str               # Relative to base directory
    content: str
    base: str                        # "repo" | "home" | "global_claude_dir"
    is_gitignored: bool = False
    merge_strategy: str = "replace"  # "replace" | "merge_sections" | "append"

class GeneratorInput(BaseModel):
    fingerprint:        RepoFingerprint
    installed_packages: list[SkullPackage]
    project_config:     ProjectConfig
    global_config:      GlobalConfig

class BaseGenerator(ABC):
    TOOL_ID:           str
    TOOL_NAME:         str
    DETECTION_FILES:   list[str] = []  # Used to detect if this tool is present

    @abstractmethod
    def generate(self, input: GeneratorInput) -> list[GeneratedFile]: ...
```

The separation between "generate" and "write" is the single most important architectural boundary. It enables:
- Dry-run / `analyze` mode with no filesystem changes
- Diff preview before any file is written
- CI mode (audit exit codes without writing)
- Unit-testable generators (assert on `GeneratedFile[]`, no mocking of filesystem)

### Section Merge Strategy

When regenerating a file that already contains manual edits (`merge_sections` strategy):

1. Parse the existing file into sections using `## Heading` as delimiters.
2. Identify auto-generated sections marked with `<!-- openskulls:section:<id> -->`.
3. Replace only marked sections with freshly generated content.
4. Unmarked sections are left entirely untouched.
5. New sections not yet in the file are appended at the end.

### Plugin Discovery

Identical pattern to analyzers:

```toml
[project.entry-points."openskulls.generators"]
claude_code = "openskulls.core.generators.claude_code:ClaudeCodeGenerator"
```

---

## Package Format

### Directory Layout

```
my-package/
├── skulls.toml              # Package manifest
├── skills/
│   ├── commit.md            # Plain markdown skill content
│   └── review-pr.md
├── rules/
│   └── typescript-strict.md
└── README.md
```

### `skulls.toml`

```toml
[package]
schema_version = "1.0.0"
name    = "@openskulls/react"
version = "2.1.0"
description = "Skills and rules for React/TypeScript projects"
tags    = ["react", "typescript", "frontend"]

[applies_when]
frameworks = ["React", "Next.js"]
languages  = ["TypeScript", "JavaScript"]

[[skills]]
id          = "component"
name        = "Create React Component"
file        = "skills/component.md"
tags        = ["react", "scaffold"]
depends_on  = []

[[rules]]
id       = "no-prop-drilling"
name     = "Avoid Prop Drilling"
file     = "rules/no-prop-drilling.md"
severity = "warn"
section  = "architecture"

[[dependencies]]
name               = "@openskulls/typescript"
version_constraint = "^1.0.0"
```

### `skulls.lock`

Mirrors npm lockfile semantics — exact resolved versions, content hashes, deterministic installs.

```json
{
  "schema_version": "1.0.0",
  "packages": {
    "@openskulls/react": {
      "resolved_version": "2.1.0",
      "content_hash": "sha256:abc123...",
      "source": "registry"
    }
  }
}
```

Stored at `[repo]/.openskulls/skulls.lock`. Committed. Updates only via `openskulls add` or a future `openskulls update`.

---

## Change Detection and Git Hooks

### Hook Installation

`openskulls init` installs two hooks:

```bash
# .git/hooks/post-commit (managed by openskulls — do not edit manually)
#!/usr/bin/env bash
if command -v openskulls &> /dev/null; then
    openskulls sync --hook \
        --changed "$(git diff-tree --no-commit-id -r --name-only HEAD)" &
fi
```

The `&` makes the hook non-blocking. The commit returns immediately. Notifications are queued and shown on the next openskulls command run or via the shell integration.

### The Sync Decision Engine

`openskulls sync` does not trigger a full re-fingerprint for every commit. A `ChangeClassifier` maps changed files to the minimum set of analyzers that need to re-run:

```
DEPENDENCY_TRIGGERS = {
    "package.json":    ["javascript", "typescript"],
    "pyproject.toml":  ["python"],
    "go.mod":          ["go"],
    "Cargo.toml":      ["rust"],
}

ARCHITECTURE_TRIGGERS = [
    "newly created directories at repo root or first depth",
    "new files matching *.router.*, *.service.*, *.model.*",
]

CICD_TRIGGERS = [
    ".github/workflows/**",
    ".gitlab-ci.yml",
    "Dockerfile",
    "docker-compose*.yml",
]
```

Only the affected analyzers re-run. Only the affected sections of generated files are regenerated.

### Drift Checks (audit)

Five checks, run in order:

| Check | What it detects |
|---|---|
| `DependencyDriftCheck` | Deps added/removed/updated vs fingerprint baseline |
| `ConventionDriftCheck` | Linter or formatter config changed significantly |
| `ArchitectureDriftCheck` | New module or service boundary introduced |
| `StaleSkillCheck` | Skill references a file path or script name that no longer exists |
| `ConflictCheck` | Two installed rules contain contradictory guidance |

Each check returns a list of `DriftFinding(severity, title, detail, affected_artifacts, auto_fixable)`.

The **context health score** is `1.0 - weighted_drift_score` where severity weights are: error=1.0, warning=0.5, info=0.1. Displayed as a score out of 100.

---

## CLI Command Specifications

### `openskulls init`

1. Run `FingerprintCollector` on the current directory.
2. Display detected signals in a Rich table.
3. Run `Interviewer` — ask only what cannot be inferred (4 questions max).
4. Suggest relevant packages from registry based on `applies_when` matching.
5. Run selected generators, collect `GeneratedFile[]`.
6. Show generation plan (Rich panel listing every file to be written).
7. On confirmation: write files, install git hooks, write `fingerprint.json` and `config.toml`.

### `openskulls sync`

1. Load `fingerprint.json` baseline.
2. Run `ChangeClassifier` on changed files (from hook) or full diff since last sync.
3. Re-run affected analyzers only.
4. Re-run generators for affected sections only.
5. Show proposed changes as a diff.
6. On confirmation: write changes, update `fingerprint.json`.

`--hook` flag: suppress interactive output, queue notification, exit 0 always (never block a commit).

### `openskulls audit`

1. Run full `FingerprintCollector` (fresh analysis, ignores cache).
2. Run all five drift checks against the committed `fingerprint.json`.
3. Render `DriftReport` with Rich: findings by severity, health score, commits since last sync.
4. `--ci` flag: exit non-zero if any `error` severity findings exist.

### `openskulls add <package>`

Accepts: `@scope/name`, `@scope/name@version`, `./local/path`, `github:org/repo`.

1. Resolve and download package (or load from local path).
2. Check dependency graph for conflicts.
3. Write to `.openskulls/` package store.
4. Update `config.toml` and `skulls.lock`.
5. Re-run generators to incorporate new skills and rules.

### `openskulls publish` *(stub in v0.1)*

Validates package format, authenticates, uploads to registry. Outputs "coming in v0.2" in v0.1.

---

## Context Hierarchy (Filesystem)

```
~/.claude/CLAUDE.md                     # Personal developer identity — never committed
~/.claude/commands/                     # Personal skills — never committed

[repo]/.openskulls/config.toml          # OpenSkulls project config — committed
[repo]/.openskulls/fingerprint.json     # Analysis baseline — committed
[repo]/.openskulls/skulls.lock          # Package lockfile — committed

[repo]/CLAUDE.md                        # Project context — committed
[repo]/.claude/commands/                # Project skills — committed
[repo]/.claude/settings.json           # Claude Code settings + hook config — committed
[repo]/.cursorrules                     # Cursor rules — committed (if Cursor used)
[repo]/.github/copilot-instructions.md # Copilot — committed (if Copilot used)
```

**Naming convention**: Claude Code uses `.claude/commands/` (not `skills/` or `rules/`). All generated files match Claude Code's actual directory structure.

---

## MVP Build Order (v0.1)

Build in this sequence — each step is independently testable before the next begins.

### Step 1: Data models
Define and freeze `RepoFingerprint`, `SkullPackage`, `Skill`, `Rule`, `ProjectConfig`, `GlobalConfig`. Write JSON Schema. Write unit tests with example fixtures. Nothing else can be correctly built until this is stable.

### Step 2: Fingerprint collector + language analyzers
`python.py`, `javascript.py`, `typescript.py`, `go.py`. The collector that orchestrates them. Hash-based caching. Test against real-world repos from GitHub.

### Step 3: Claude Code generator
Takes a `RepoFingerprint`, produces `CLAUDE.md` (via Jinja2), `.claude/commands/` files (from any installed packages), and `settings.json`. Include the section merge strategy for existing files.

### Step 4: `init` command (no interview yet)
Wire collector → generator → file writer. Hard-code sensible defaults. The goal: `openskulls init` in a Python or TypeScript repo writes a correct, useful CLAUDE.md in under 10 seconds.

### Step 5: Interviewer
Add the 4-question interview flow on top of the working init. Rich prompts, save answers to `config.toml`.

### Step 6: Git hook + non-blocking sync
Install post-commit hook, implement `ChangeClassifier`, wire `openskulls sync`.

### Step 7: Dependency drift check + `audit` command
Implement `DependencyDriftCheck` only. Wire `openskulls audit` with the health score output.

### Step 8: `add` command (local paths only)
`openskulls add ./path/to/package` — no registry yet. Validates, installs, updates `skulls.lock`, triggers regeneration.

**v0.1 is done when**: a developer can clone an unfamiliar Python or TypeScript repo, run `openskulls init`, and an agent produces an idiomatic contribution without asking clarifying questions about project structure.

---

## What is Explicitly Deferred

| Feature | Target |
|---|---|
| Framework analyzers (React, Django, etc.) | v0.2 |
| Cursor, Cline, Copilot, Continue generators | v0.2 |
| Public registry client (`add @scope/name`) | v0.2 |
| Monorepo support | v0.2 |
| Full audit suite (all 5 checks) | v0.2 |
| `openskulls refine` (feedback loop) | v0.3 |
| Skill graph visualization | v0.3 |
| `openskulls publish` | v0.3 |
| CI/CD action | v0.3 |
| Third-party plugin API (entry_points) | v0.3 |
| Organization-level context | v1.0 |
| Agent performance metrics | v1.0 |

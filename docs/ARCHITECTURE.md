# OpenSkulls — Architecture Reference

> **Tagline**: Makes your repo readable to AI agents, then keeps it readable as the code evolves.

This document describes the design principles, module structure, data flows, configuration schemas, and extension points for the openskulls CLI. It is intended for contributors and anyone who wants to extend the tool.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Repository Layout](#repository-layout)
3. [Key Data Structures](#key-data-structures)
4. [`openskulls init` Flow](#openskulls-init-flow)
5. [`openskulls sync` Flow](#openskulls-sync-flow)
6. [AI Pipeline](#ai-pipeline)
7. [Generator System](#generator-system)
8. [Section Merge Strategy](#section-merge-strategy)
9. [Config File Reference](#config-file-reference)
10. [Git Hook](#git-hook)
11. [Extending OpenSkulls](#extending-openskulls)
12. [Known Implementation Gaps](#known-implementation-gaps)

---

## Design Principles

These principles are the foundation of every architectural decision in this codebase. New features must respect all of them.

### 1. AI-first analysis, no hand-written parsers
Language detection, framework identification, and convention discovery are all delegated to the AI CLI (`claude -p`). The collector does only the work that is cheaper locally: a filesystem walk and config-file reads. This keeps the core tiny and makes it language-agnostic by default.

### 2. Generators are pure functions
A generator takes a `GeneratorInput` and returns `GeneratedFile[]`. It never reads the filesystem, calls the network, or writes anything. All I/O belongs to the CLI layer. This makes generators trivially unit-testable (assert on `GeneratedFile[]` — no filesystem mocking required) and enables dry-run, diff, and CI modes for free.

### 3. Zod is the single source of truth for types
Every data structure (`RepoFingerprint`, `AISkill`, `ProjectConfig`, …) is defined as a Zod schema. TypeScript types are derived with `z.infer<typeof Schema>`. This gives compile-time safety and runtime validation in one place, with no duplication.

### 4. Content hash for drift detection
`RepoFingerprint.contentHash` is a SHA-256 of all fingerprint fields excluding machine-specific and ephemeral fields (`repoRoot`, `generatedAt`, `contentHash`). The same codebase on any machine produces the same hash. `hasDrifted(current, baseline)` is a single string comparison.

### 5. Preserve manual edits — section merge strategy
OpenSkulls uses HTML comment markers (`<!-- openskulls:section:<id> -->`) to demarcate managed sections inside otherwise hand-editable files (e.g. `CLAUDE.md`). On re-generation, only the managed sections are replaced; everything the developer wrote by hand is preserved. New sections are appended. Removed sections are kept.

### 6. Non-blocking automation
The git hook (`post-commit`) always exits `0`. Every AI call in hook mode is wrapped in a `try/catch`. The tool must never block a commit or surface a crash to the terminal during background sync.

### 7. Stdin preferred for AI prompts
`claude` receives prompts via `child.stdin` (invoked as `claude -p -`). This avoids `ARG_MAX` limits on large repos with many config files. Other CLIs (`codex`, `copilot`) receive the prompt as a `-p` argument because they do not accept stdin in the same way — see `AICLIAdapter.invoke: 'stdin' | 'arg'` in `ai-collector.ts`. Any new adapter that supports stdin **must** use it; arg-style is the fallback only when stdin is not available.

---

## Repository Layout

```
openskulls/
├── src/
│   ├── index.ts                          ← npm bin entry point
│   ├── cli/
│   │   ├── index.ts                      ← Commander setup, command registration
│   │   ├── ui/
│   │   │   └── console.ts                ← log.*, panel(), table(), spinner(), fatal()
│   │   └── commands/
│   │       ├── init.ts                   ← `openskulls init` — 12-step flow
│   │       ├── sync.ts                   ← `openskulls sync` — interactive + hook modes
│   │       ├── hook.ts                   ← installGitHook(), shouldTriggerSync()
│   │       ├── interviewer.ts            ← runInterviewer() — Part A (static) + Part B (AI Qs)
│   │       ├── shared.ts                 ← writeGeneratedFile() shared by init + sync
│   │       ├── audit.ts                  ← stub (pending)
│   │       ├── add.ts                    ← stub (pending)
│   │       ├── publish.ts                ← stub (pending)
│   │       └── uninstall.ts              ← removes git hook
│   └── core/
│       ├── config/
│       │   └── types.ts                  ← ProjectConfig, GlobalConfig, WorkflowConfig (Zod)
│       ├── fingerprint/
│       │   ├── types.ts                  ← RepoFingerprint + all Signal schemas (Zod)
│       │   ├── ai-collector.ts           ← AIFingerprintCollector, detectAICLI(), invokeAICLI()
│       │   ├── prompt-builder.ts         ← buildAnalysisPrompt() — pure, no I/O
│       │   ├── questionnaire-builder.ts  ← generateQuestionnaire(), buildQuestionnairePrompt()
│       │   ├── skills-builder.ts         ← generateAISkills(), AISkill schema
│       │   ├── skills-prompt.ts          ← buildSkillsPrompt() — pure, no I/O
│       │   ├── architect-builder.ts      ← generateArchitectSkill(), buildArchitectPrompt()
│       │   └── cache.ts                  ← loadFingerprint(), saveFingerprint()
│       ├── generators/
│       │   ├── base.ts                   ← GeneratedFile, Generator interface, BaseGenerator
│       │   ├── merge.ts                  ← mergeSections(), parseChunks(), extractSections()
│       │   ├── shared.ts                 ← STYLE_LABELS, isConventionalCommits(), buildWorkflowRuleLines()
│       │   ├── claude-code.ts            ← ClaudeCodeGenerator
│       │   ├── copilot.ts                ← CopilotGenerator
│       │   └── codex.ts                  ← CodexGenerator
│       └── packages/
│           └── types.ts                  ← SkullPackage, Skill, Rule, Lockfile (Zod)
├── templates/
│   ├── claude-code/
│   │   └── CLAUDE.md.hbs                 ← Handlebars template, tagged sections
│   └── prompts/
│       ├── analysis.md.hbs               ← AI analysis prompt template
│       ├── questionnaire.md.hbs          ← AI questionnaire prompt template
│       ├── skills.md.hbs                 ← AI skills generation prompt template
│       └── architect.md.hbs              ← AI architect skill prompt template
└── tests/
    ├── helpers/index.ts                  ← makeContext(files) — real temp dir factory
    ├── fingerprint/                      ← Unit tests for types, ai-collector, builders
    ├── generators/                       ← Unit tests for claude-code, copilot, merge
    └── cli/                              ← Unit tests for hook logic
```

---

## Key Data Structures

### RepoFingerprint
The central normalized model. All generators consume it; nothing reads the filesystem directly after collection.

```
RepoFingerprint {
  schemaVersion: string          // "1.0.0"
  generatedAt:   string          // ISO timestamp
  repoRoot:      string          // absolute path (excluded from hash)
  repoName:      string

  languages:     LanguageSignal[]
  frameworks:    FrameworkSignal[]
  conventions:   ConventionSignal[]
  dependencies:  DependencyMap[]
  testing?:      TestingSignal
  cicd?:         CICDSignal
  linting?:      LintingSignal
  architecture:  ArchitectureSignal
  git?:          GitSignal
  aiCLIs:        AICLISignal[]   // which AI tools are configured in the repo

  description?:      string
  primaryLanguage?:  string      // computed — highest-% language
  primaryFramework?: string      // computed — fullstack > backend

  contentHash:   string          // SHA-256 (excludes repoRoot, generatedAt, contentHash)
}
```

### GeneratedFile
What generators return. Never written by generators themselves.

```
GeneratedFile {
  relativePath:  string
  content:       string
  base:          'repo'          // [repoRoot]/relativePath
               | 'home'          // ~/relativePath
               | 'global_claude' // ~/.claude/relativePath
  isGitignored:  boolean
  mergeStrategy: 'replace'       // overwrite file entirely
               | 'merge_sections'// regenerate tagged sections only
               | 'append'        // append if not present
}
```

### AISkill
What the skills and architect builders return.

```
AISkill {
  id:          string   // kebab-case — becomes directory name + slash command name
  title:       string   // "Add a New API Route"
  description: string   // trigger description — written to YAML frontmatter
  content:     string   // full markdown body of the SKILL.md file
  category:    'workflow' | 'testing' | 'debugging'
             | 'refactoring' | 'documentation' | 'devops' | 'other'
}
```

### WorkflowConfig
Saved to `.openskulls/config.toml` under `[workflow]`. Drives file generation and interviewer behavior.

```
WorkflowConfig {
  autoDocs:         'always' | 'ask' | 'never'
  autoCommit:       'always' | 'ask' | 'never'
  architectEnabled: boolean
  architectDomain:  string
  architectReview:  'always' | 'ask' | 'never'
  useSubagents:     boolean
}
```

---

## `openskulls init` Flow

Executed once per repo. Runs 3–4 AI calls, an interactive interviewer, multiple generators, and installs the git hook.

```
User: openskulls init [path]
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 0 — Detect AI engine                                      │
  │  detectAICLI() → walks PATH, runs `cmd --version`               │
  │  Priority: claude → codex → copilot                             │
  │  Fatal if none found.                                            │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AICLIAdapter { command, invoke, version }
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 1 — Fingerprint collection                                 │
  │                                                                  │
  │  AIFingerprintCollector.collect(repoRoot)                        │
  │    │                                                             │
  │    ├─ scanRepo()          → fileTree[], configFiles Map          │
  │    ├─ readConfigContents()→ config file contents (≤32 KB each)   │
  │    ├─ detectAICLIs()      → AICLISignal[] (pure, no AI)          │
  │    ├─ buildAnalysisPrompt()→ prompt string                       │
  │    ├─ invokeAICLI() ─────────────────────────────────────────── │
  │    │      AI Call 1: repo analysis                               │
  │    │      stdin → claude -p -                                    │
  │    │      response → AIAnalysisResponse (Zod-validated)          │
  │    │                                                             │
  │    └─ createFingerprint() → RepoFingerprint (with contentHash)   │
  └────────────────────────────┬────────────────────────────────────┘
                               │ RepoFingerprint
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 2 — Display detected signals                               │
  │  Show languages, frameworks, testing, linting, AI tools          │
  └────────────────────────────┬────────────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 3 — AI questionnaire generation (skipped with --yes)       │
  │                                                                  │
  │  generateQuestionnaire(fingerprint)                              │
  │    AI Call 2: questionnaire                                      │
  │    prompt: buildQuestionnairePrompt(fingerprint)                  │
  │    response → AIQuestion[]   (0–8 repo-specific questions)       │
  │    Non-fatal: returns [] on failure                              │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AIQuestion[]
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 4 — Interviewer                                            │
  │                                                                  │
  │  runInterviewer({ yes }, aiQuestions)                            │
  │    Part A: Static workflow questions (always):                   │
  │      - auto-docs preference (always/ask/never)                   │
  │      - auto-commit preference (always/ask/never)                 │
  │      - architect agent on/off + domain + review trigger          │
  │      - subagent generation mode                                  │
  │    Part B: Dynamic AI questions (if aiQuestions.length > 0):     │
  │      - yesno / choice / text question types                      │
  │      - answers saved to qa map                                   │
  │                                                                  │
  │  Returns: UserContext { workflowConfig, qa }                     │
  └────────────────────────────┬────────────────────────────────────┘
                               │ UserContext
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 5 — AI skills generation                                   │
  │                                                                  │
  │  generateAISkills(fingerprint, logger, qa)                       │
  │    AI Call 3: skills                                             │
  │    prompt: buildSkillsPrompt(fingerprint, qa)                    │
  │    response → AISkill[]                                          │
  │    Non-fatal: [] on failure                                      │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AISkill[]
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 6 — Architect skill generation (if architectEnabled)       │
  │                                                                  │
  │  generateArchitectSkill(fingerprint, workflowConfig, logger, qa) │
  │    AI Call 4: architect                                          │
  │    prompt: buildArchitectPrompt(fingerprint, workflowConfig, qa) │
  │    response → AISkill (single, prepended to skills list)         │
  │    Non-fatal: skipped on failure                                 │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AISkill[] (architect first)
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 7 — File generation (pure, no I/O)                         │
  │                                                                  │
  │  toolsToGenerate = active engine ∪ repo-detected AI CLIs         │
  │                                                                  │
  │  ClaudeCodeGenerator.generate(input)  → GeneratedFile[]          │
  │  CopilotGenerator.generate(input)     → GeneratedFile[]  if set  │
  │  CodexGenerator.generate(input)       → GeneratedFile[]  if set  │
  └────────────────────────────┬────────────────────────────────────┘
                               │ GeneratedFile[]
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 8 — Show generation plan                                   │
  │  For each GeneratedFile: resolve abs path, check create/update   │
  └────────────────────────────┬────────────────────────────────────┘
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 9 — Confirm (skip with --yes or --dry-run)                 │
  └────────────────────────────┬────────────────────────────────────┘
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 10 — Write files                                           │
  │  writeGeneratedFile(file, absPath)                               │
  │    'replace'        → overwrite                                  │
  │    'merge_sections' → mergeSections(existing, new)               │
  │    'append'         → append if content not present              │
  └────────────────────────────┬────────────────────────────────────┘
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 11 — Persist state                                         │
  │  saveFingerprint(repoRoot, fingerprint)                          │
  │    → .openskulls/fingerprint.json                                │
  │  saveConfig(repoRoot, workflowConfig, detectedTools, qa)         │
  │    → .openskulls/config.toml                                     │
  └────────────────────────────┬────────────────────────────────────┘
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 12 — Install git hook                                      │
  │  installGitHook(repoRoot)                                        │
  │    → .git/hooks/post-commit (idempotent, chmod +x)               │
  └─────────────────────────────────────────────────────────────────┘
```

---

## `openskulls sync` Flow

Two modes: **interactive** (developer runs it manually) and **hook** (triggered automatically on every commit).

### Interactive Mode

```
User: openskulls sync [path]
         │
         ▼
  loadFingerprint(repoRoot)   ← .openskulls/fingerprint.json
  loadWorkflowConfig(repoRoot)← .openskulls/config.toml [workflow]
         │
         ▼ (fatal if no fingerprint — run init first)
  AIFingerprintCollector.collect() → current fingerprint
         │
         ▼
  hasDrifted(current, baseline)?
    ├─ NO  → log "Context is up to date." → exit 0
    └─ YES ↓
         │
         ▼
  generateAISkills()          ← non-fatal, skips on error
  generateArchitectSkill()    ← non-fatal, only if architectEnabled
         │
         ▼
  ClaudeCodeGenerator.generate() → GeneratedFile[]
  + CopilotGenerator (if copilot in aiCLIs)
         │
         ▼
  Show plan → Confirm → Write files → saveFingerprint()
```

### Hook Mode (post-commit)

```
.git/hooks/post-commit fires
  └─ openskulls sync --hook --changed "$changed"

         │
         ▼
  shouldTriggerSync(changedFiles, triggerPatterns)?
    ├─ NO  → exit 0  (fast path, no AI call)
    └─ YES ↓
         │
         ▼
  loadFingerprint(repoRoot)
    ├─ NOT FOUND → exit 0 (init not run yet — silent)
    └─ FOUND ↓
         │
         ▼
  AIFingerprintCollector.collect() → current
         │
         ▼
  hasDrifted(current, baseline)?
    ├─ NO  → exit 0
    └─ YES ↓
         │
         ▼
  generateAISkills()          ← try/catch, silent on error
  generateArchitectSkill()    ← try/catch, silent on error
         │
         ▼
  Generate + write files silently
  saveFingerprint()
         │
         ▼
  exit 0  ← always, never blocks the commit
```

**Trigger patterns** (files that cause a hook run):
```
package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb
requirements*.txt, pyproject.toml, Pipfile, Pipfile.lock
go.mod, go.sum, Cargo.toml, Cargo.lock
Gemfile, Gemfile.lock, tsconfig*.json
.github/workflows/**
```

---

## AI Pipeline

Three (or four) sequential AI CLI invocations during `init`. Each is a `claude -p -` call with a Handlebars-rendered prompt written to stdin.

```
                 RepoFingerprint
                       │
        ┌──────────────┼──────────────────┐
        │              │                  │
        ▼              ▼                  ▼
  Call 1: Analysis   Call 2: Questions   Call 3: Skills
  ─────────────────  ─────────────────   ─────────────
  Prompt:            Prompt:             Prompt:
  analysis.md.hbs    questionnaire       skills.md.hbs
  + fileTree         .md.hbs             + fingerprint
  + configContents   + fingerprint       + qa answers
                     summary
  Returns:           Returns:            Returns:
  AIAnalysisResponse AIQuestionnaireResponse  AISkillsResponse
  (Zod-validated)    { questions:        { skills: AISkill[] }
                       AIQuestion[] }
  Used to build:     Presented to user   Emitted as:
  RepoFingerprint    via runInterviewer()  .claude/skills/<id>/SKILL.md
                     → qa map              .claude/skills.md (index)

        Call 4 (optional): Architect
        ────────────────────────────
        Prompt: architect.md.hbs
          + fingerprint summary
          + workflowConfig
          + qa answers
        Returns: AISkill (single)
        Emitted as: .claude/skills/architect-review/SKILL.md
```

**Common invocation path:**

```
detectAICLI()
  → runVersion("claude")  → AICLIAdapter { command: "claude", invoke: "stdin" }

invokeAICLI(adapter, prompt, timeoutMs)
  → spawn("claude", ["-p", "-"])
  → write prompt to child.stdin
  → collect stdout
  → on exit(0): resolve(stdout)
  → on timeout: kill + reject
  → on exit(!0): reject

stripJsonFences(raw)   ← removes ```json ... ``` wrappers
JSON.parse(cleaned)
Schema.parse(data)     ← Zod validates structure
```

---

## Generator System

### Interface contract

```typescript
interface Generator {
  toolId:         string            // "claude_code", "copilot", "codex"
  toolName:       string            // "Claude Code"
  detectionFiles: readonly string[] // signals this tool is in use

  generate(input: GeneratorInput): GeneratedFile[]
  // MUST be: pure, stateless, side-effect-free
}
```

`GeneratorInput` carries everything a generator could need — it never reads the filesystem.

```
GeneratorInput {
  fingerprint:       RepoFingerprint
  installedPackages: SkullPackage[]
  projectConfig:     ProjectConfig
  globalConfig:      GlobalConfig
  aiSkills?:         AISkill[]
  workflowConfig?:   WorkflowConfig
  userAnswers?:      Record<string, string>
}
```

### File outputs per generator

```
ClaudeCodeGenerator (toolId: "claude_code")
  ├─ CLAUDE.md                              base=repo,  merge_sections
  │    Handlebars template (CLAUDE.md.hbs)
  │    Sections: overview, tech_stack, architecture, conventions, testing, workflow_rules
  ├─ .claude/commands/run-tests.md          base=repo,  replace  (if testing detected)
  ├─ .claude/commands/commit.md             base=repo,  replace  (if conventional commits)
  ├─ .claude/skills.md                      base=repo,  merge_sections  (if aiSkills present)
  │    Index of all skills, grouped by category
  ├─ .claude/skills/<id>/SKILL.md           base=repo,  replace  (one per AISkill)
  │    YAML frontmatter (name, description) + markdown body
  └─ .claude/settings.json                  base=repo,  replace

CopilotGenerator (toolId: "copilot")
  └─ .github/copilot-instructions.md        base=repo,  merge_sections

CodexGenerator (toolId: "codex")
  └─ AGENTS.md                              base=repo,  merge_sections
```

### Generator selection in init

```
toolsToGenerate = Set(
  ENGINE_TO_TOOL[adapter.command],          // active AI engine
  ...fingerprint.aiCLIs.map(a => a.tool)    // tools already configured in repo
)
```

This means running `openskulls init` with Copilot active on a repo that already has `CLAUDE.md` will generate both `CLAUDE.md` and `.github/copilot-instructions.md`.

---

## Section Merge Strategy

`mergeSections(existingContent, newContent)` enables openskulls to update its sections without destroying manual edits.

```
Section markers:
  <!-- openskulls:section:<id> -->
  ...managed content...
  <!-- /openskulls:section:<id> -->
```

```
BEFORE (existing CLAUDE.md):              AFTER merge:

  # My Project                              # My Project        ← preserved

  <!-- openskulls:section:overview -->      <!-- openskulls:section:overview -->
  ## Overview                               ## Overview         ← REPLACED with new
  Old AI-generated overview                 New AI-generated overview
  <!-- /openskulls:section:overview -->     <!-- /openskulls:section:overview -->

  ## My Custom Section                      ## My Custom Section← preserved
  Hand-written by developer.                Hand-written by developer.

  <!-- openskulls:section:tech_stack -->    <!-- openskulls:section:tech_stack -->
  Old tech stack                            New tech stack      ← REPLACED
  <!-- /openskulls:section:tech_stack -->   <!-- /openskulls:section:tech_stack -->

                                            <!-- openskulls:section:new_section -->
                                            New section added   ← APPENDED
                                            <!-- /openskulls:section:new_section -->
```

**Rules:**
- Section in both old and new → new version replaces old
- Section only in old → kept as-is (template dropped it, preserve anyway)
- Section only in new → appended at end
- Manual text → never touched

---

## Config File Reference

### `.openskulls/config.toml`
Written by `openskulls init`, updated by `openskulls sync`. Committed with the repo.

```toml
schema_version = "1.0.0"

# Which AI context generators are active for this repo.
# name values: "claude_code" | "codex" | "copilot"
[[targets]]
name    = "claude_code"
enabled = true

[[targets]]
name    = "copilot"
enabled = false

# Paths excluded from repo analysis and file tree sent to AI.
exclude_paths = [
  "node_modules", ".git", "dist", "build",
  ".venv", "__pycache__", ".next", ".nuxt", "coverage"
]

[workflow]
# How Claude should handle documentation updates.
# "always" = do it automatically, "ask" = prompt the user, "never" = skip
auto_docs         = "ask"

# Whether Claude should auto-commit after completing a task.
auto_commit       = "ask"

# Whether to generate a domain-expert architect skill.
architect_enabled = false

# Domain focus for the architect (e.g. "fintech", "developer tooling").
# Leave blank to auto-detect from project signals.
architect_domain  = ""

# When the architect should review new features.
architect_review  = "ask"

# Whether to use parallel subagents for skill generation.
use_subagents     = false

# Saved answers from the AI questionnaire (keys = AIQuestion.id).
# These are fed back into subsequent AI calls (skills, architect).
[workflow.answers]
testing_strategy    = "unit+integration"
deployment_target   = "vercel"
```

### `.openskulls/fingerprint.json`
Written by `openskulls init` and `openskulls sync`. Used for drift detection. **Do not edit by hand.**

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-02-27T12:00:00.000Z",
  "repoRoot": "/home/user/myproject",
  "repoName": "myproject",
  "contentHash": "a3f9c2...",

  "languages": [
    { "name": "TypeScript", "version": "5.5.0", "confidence": "high",
      "percentage": 95, "primary": true, "evidence": ["tsconfig.json found"] }
  ],
  "frameworks": [
    { "name": "commander", "version": "12.1.0", "confidence": "high",
      "category": "cli", "evidence": ["package.json dependency"] }
  ],
  "conventions": [
    { "name": "package_manager", "value": "npm", "confidence": "high",
      "evidence": ["package-lock.json found"] }
  ],
  "dependencies": [
    { "runtime": { "zod": "^3.23.8" }, "dev": { "vitest": "^2.0.0" },
      "peer": {}, "sourceFile": "package.json" }
  ],
  "testing": {
    "framework": "vitest", "pattern": "tests/**/*.test.ts",
    "coverageTool": "v8", "confidence": "high"
  },
  "linting": { "tools": ["eslint"], "configFiles": ["eslint.config.js"], "styleRules": {} },
  "architecture": {
    "style": "cli", "entryPoints": ["src/index.ts"],
    "moduleStructure": ["src/cli", "src/core", "templates", "tests"]
  },
  "aiCLIs": [
    { "tool": "claude_code", "confidence": "high", "evidence": ["CLAUDE.md found"] }
  ],
  "primaryLanguage": "TypeScript",
  "primaryFramework": "commander"
}
```

### `.claude/settings.json`
Minimal Claude Code settings file. Replaced on every sync.

```json
{
  "version": 1
}
```

### `.claude/skills.md`
Auto-generated index of all AI-generated skills. Uses `merge_sections` strategy.

```markdown
<!-- openskulls:section:skills -->
# Project Skills

> Auto-generated — run `openskulls sync` to update.
> Each skill lives at `.claude/skills/<id>/SKILL.md` and is available as a `/<id>` slash command.

## Workflow

### Add a New Command
`/add-command` — Use when adding a new top-level command to the CLI.

## Testing

### Run Integration Tests
`/integration-test` — Run the full integration test suite against a live environment.
<!-- /openskulls:section:skills -->
```

### `.claude/skills/<id>/SKILL.md`
One per AI-generated skill. YAML frontmatter + markdown body. Replaced on every sync.

```markdown
---
name: add-command
description: >
  Use when adding a new top-level command to the CLI.
  Triggers: new command, commander, program.command, CLI action.
---

# Add a New Command

## When to use
...
```

---

## Git Hook

Installed at `.git/hooks/post-commit` by `openskulls init`. Removed by `openskulls uninstall`.

```sh
#!/bin/sh
# managed by openskulls
# Auto-generated — do not edit. Remove with: openskulls uninstall
command -v openskulls >/dev/null 2>&1 || exit 0
changed=$(git diff-tree --no-commit-id -r --name-only HEAD 2>/dev/null)
openskulls sync --hook --changed "$changed"
exit 0
```

**Key design points:**
- `command -v openskulls` guard: silently exits if openskulls is not on PATH (e.g. after uninstalling globally but not removing the hook)
- Passes changed filenames so `shouldTriggerSync()` can skip the AI call when no trigger-pattern file was modified
- Always exits `0` — the hook is advisory, never blocking
- Idempotent: `installGitHook()` checks for `HOOK_MARKER` before writing

---

## Extending OpenSkulls

### Add a new Generator

1. Create `src/core/generators/<name>.ts` extending `BaseGenerator`:

```typescript
import { BaseGenerator, repoFile, type GeneratedFile, type GeneratorInput } from './base.js'

export class MyToolGenerator extends BaseGenerator {
  readonly toolId   = 'my_tool'
  readonly toolName = 'My Tool'
  override readonly detectionFiles = ['.mytool/config.yaml'] as const

  generate(input: GeneratorInput): GeneratedFile[] {
    const { fingerprint } = input
    // Build content — pure function, no I/O
    const content = `# Context for ${fingerprint.repoName}\n`
    return [repoFile('.mytool/context.md', content, 'merge_sections')]
  }
}
```

2. Register in `src/cli/commands/init.ts`:
   - Add `'my_tool'` to `ENGINE_TO_TOOL` and `ALL_TARGETS` in `init.ts`
   - Add a `toolsToGenerate.has('my_tool')` branch calling `new MyToolGenerator().generate(generatorInput)`

3. Register in `src/cli/commands/sync.ts`:
   - The sync interactive mode adds generators by checking `fingerprint.aiCLIs` (not `ENGINE_TO_TOOL`). Add a matching branch:
     ```typescript
     if (detectedTools.includes('my_tool')) {
       generatedFiles.push(...new MyToolGenerator().generate(generatorInput))
     }
     ```
   - Do the same in `hookMode` inside `sync.ts`.
   - **Note**: as of v0.1, `CodexGenerator` is only called in `init.ts`, not `sync.ts`. This is a known gap (see [Known Implementation Gaps](#known-implementation-gaps)) — do not repeat the pattern.

4. Add detection logic in `detectAICLIs()` in `ai-collector.ts` if the tool leaves config files in the repo.

5. Write tests in `tests/generators/<name>.test.ts` using `makeContext()`.

### Add a new top-level command

Use the `/add-command` skill or follow this pattern:

1. Create `src/cli/commands/<name>.ts` with a `register<Name>(program: Command)` function
2. Import and call it in `src/cli/index.ts`
3. Implement business logic; call `AIFingerprintCollector` and generators as needed

### Add a new fingerprint field

1. Add the field to the relevant Zod schema in `src/core/fingerprint/types.ts`
2. Update `buildAnalysisPrompt()` in `prompt-builder.ts` to ask the AI for the new field
3. Update `AIAnalysisResponse` in `ai-collector.ts` if the field comes from the AI
4. Update any generators that should use the new field
5. Update `HASH_EXCLUDE` in `types.ts` only if the field should not affect drift detection

### Add new AI prompt templates

All prompt templates are Handlebars (`.md.hbs`) files under `templates/prompts/`. They are loaded once at module load and compiled. To add or modify a prompt:

1. Edit or add a `.hbs` file under `templates/prompts/`
2. The corresponding `*-builder.ts` file loads it via `readFileSync` + `Handlebars.compile()`
3. No TypeScript changes needed if the template variable names stay the same

### Add a new config field

1. Add the field to the appropriate Zod schema in `src/core/config/types.ts`
2. Update `saveConfig()` in `init.ts` to write the new field to `config.toml`
3. Update `loadWorkflowConfig()` if reading the field back is needed
4. Update the [Config File Reference](#config-file-reference) in this document

---

## Known Implementation Gaps

These are places where the current code diverges from the ideal design. Each is a known trade-off, not a surprise.

| Gap | Location | Impact | Tracking |
|---|---|---|---|
| `CodexGenerator` not called in `sync.ts` | `sync.ts` interactive + hook modes | `AGENTS.md` is generated on `init` but never updated on drift. | Task R-2/R-3 (generator registry) will fix this. |
| `personalFile()` and `home` FileBase unused | `base.ts` | Defined API surface with no callers — no generator emits a personal file yet. | Needed when personal skills (`~/.claude/commands/`) are supported. |
| `append` merge strategy unused | `shared.ts: writeGeneratedFile()` | Implemented but no generator produces a file with `mergeStrategy: 'append'`. | Will be used when package-installed rules are appended to existing files. |
| Generator selection hardcoded in init/sync | `init.ts`, `sync.ts` | Adding a new generator requires edits in two command files. | Tasks R-2/R-3: generator registry (`getBuiltinGenerators()`) will centralise this. |

---

## Invariants to Preserve

| Invariant | Location |
|---|---|
| Generators must never write files | `src/core/generators/` |
| All schemas are Zod, types are inferred | `src/core/*/types.ts` |
| `contentHash` excludes `repoRoot`, `generatedAt`, `contentHash` | `types.ts: HASH_EXCLUDE` |
| Hook always exits 0 | `hook.ts`, `sync.ts: hookMode` |
| `claude` prompts go via stdin; arg-style only for CLIs that don't support stdin | `ai-collector.ts: AICLIAdapter.invoke` |
| `mergeSections` is pure — no filesystem access | `merge.ts` |
| Fingerprint is the only channel from collector to generators | architecture |

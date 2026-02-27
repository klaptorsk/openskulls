# OpenSkulls — Architecture Reference

> **Tagline**: Makes your repo readable to AI agents, then keeps it readable as the code evolves.

This document describes the design principles, module structure, data flows, configuration schemas, and extension points for the openskulls CLI. It is intended for contributors and anyone who wants to extend the tool.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Repository Layout](#repository-layout)
3. [Module Dependency Graph](#module-dependency-graph)
4. [Key Data Structures](#key-data-structures)
5. [`openskulls init` Flow](#openskulls-init-flow)
6. [`openskulls sync` Flow](#openskulls-sync-flow)
7. [AI Pipeline](#ai-pipeline)
8. [Generator System](#generator-system)
9. [Section Merge Strategy](#section-merge-strategy)
10. [Drift Detection](#drift-detection)
11. [Config File Reference](#config-file-reference)
12. [Git Hook](#git-hook)
13. [Test Strategy](#test-strategy)
14. [Extending OpenSkulls](#extending-openskulls)
15. [Architecture Decision Records](#architecture-decision-records)
16. [Known Implementation Gaps](#known-implementation-gaps)
17. [Invariants to Preserve](#invariants-to-preserve)

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
OpenSkulls uses HTML comment markers (`<!-- openskulls:section:<id> -->`) to demarcate managed sections inside otherwise hand-editable files (e.g. `CLAUDE.md`). On re-generation, only the managed sections are replaced; everything the developer wrote by hand is preserved. New sections are appended.

### 6. Non-blocking automation
The git hook (`post-commit`) always exits `0`. Every AI call in hook mode is wrapped in a `try/catch`. The tool must never block a commit or surface a crash to the terminal during background sync.

### 7. Stdin preferred for AI prompts
`claude` receives prompts via `child.stdin` (invoked as `claude -p -`). This avoids `ARG_MAX` limits on large repos with many config files. Other CLIs (`codex`, `copilot`) receive the prompt as a `-p` argument because they do not accept stdin in the same way — see `AICLIAdapter.invoke: 'stdin' | 'arg'` in `ai-collector.ts`. Any new adapter that supports stdin **must** use it; arg-style is the fallback only when stdin is not available.

### 8. Non-fatal AI degradation
Skills generation (call 3) and architect skill generation (call 4) are explicitly non-fatal. If either fails, `init` and `sync` continue without them. The fingerprint (call 1) is the only fatal AI dependency.

---

## Repository Layout

```
openskulls/
├── src/
│   ├── index.ts                          ← npm bin entry point
│   ├── cli/
│   │   ├── index.ts                      ← Commander setup, command registration
│   │   ├── ui/
│   │   │   ├── console.ts                ← log.*, panel(), table(), spinner(), fatal()
│   │   │   └── prompts.ts                ← circleMultiselect() — @clack/core renderer
│   │   └── commands/
│   │       ├── init.ts                   ← `openskulls init` — 12-step flow
│   │       ├── sync.ts                   ← `openskulls sync` — interactive + hook modes
│   │       ├── hook.ts                   ← installGitHook(), shouldTriggerSync()
│   │       ├── interviewer.ts            ← runInterviewer() — Part A (static) + Part B (AI Qs)
│   │       ├── shared.ts                 ← writeGeneratedFile() shared by init + sync
│   │       ├── audit.ts                  ← stub (pending v0.2)
│   │       ├── add.ts                    ← stub (pending v0.2)
│   │       ├── publish.ts                ← stub (pending v0.2)
│   │       └── uninstall.ts              ← removes git hook, generated files, sections
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
│       │   ├── registry.ts               ← getBuiltinGenerators(), selectGenerators()
│       │   ├── merge.ts                  ← mergeSections(), parseChunks(), extractSections()
│       │   ├── shared.ts                 ← STYLE_LABELS, isConventionalCommits(), buildWorkflowRuleLines()
│       │   ├── claude-code.ts            ← ClaudeCodeGenerator
│       │   ├── copilot.ts                ← CopilotGenerator
│       │   ├── codex.ts                  ← CodexGenerator
│       │   └── cursor.ts                 ← CursorGenerator
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
├── docs/
│   └── ARCHITECTURE.md                   ← This file
└── tests/
    ├── helpers/index.ts                  ← makeContext(files) — real temp dir factory
    ├── fingerprint/                      ← Unit tests for types, ai-collector, builders
    ├── generators/                       ← Unit tests for claude-code, copilot, cursor, merge
    └── cli/                              ← Unit tests for hook logic
```

---

## Module Dependency Graph

```
src/index.ts
    └── src/cli/index.ts (Commander, registers all commands)
             ├── commands/init.ts
             │     ├── core/fingerprint/ai-collector.ts  (AIFingerprintCollector, detectAICLIFor)
             │     ├── core/fingerprint/questionnaire-builder.ts
             │     ├── core/fingerprint/skills-builder.ts
             │     ├── core/fingerprint/architect-builder.ts
             │     ├── core/fingerprint/cache.ts
             │     ├── core/generators/registry.ts  →  claude-code, copilot, codex, cursor
             │     ├── core/config/types.ts
             │     ├── cli/ui/console.ts
             │     ├── cli/ui/prompts.ts
             │     ├── commands/shared.ts
             │     ├── commands/hook.ts
             │     └── commands/interviewer.ts
             ├── commands/sync.ts
             │     ├── core/fingerprint/ai-collector.ts
             │     ├── core/fingerprint/cache.ts
             │     ├── core/fingerprint/types.ts   (hasDrifted)
             │     ├── core/fingerprint/skills-builder.ts
             │     ├── core/fingerprint/architect-builder.ts
             │     ├── core/generators/registry.ts
             │     ├── core/config/types.ts
             │     ├── cli/ui/console.ts
             │     └── commands/shared.ts
             ├── commands/uninstall.ts
             │     ├── cli/ui/console.ts
             │     └── commands/hook.ts  (HOOK_MARKER)
             ├── commands/audit.ts   (stub)
             ├── commands/add.ts     (stub)
             └── commands/publish.ts (stub)

Pure dependency chain (no I/O):
  templates/*.hbs  ←read at module load→  *-builder.ts  →  buildXxxPrompt()
  core/fingerprint/types.ts  ←  core/generators/base.ts
  core/generators/shared.ts  ←  claude-code.ts, copilot.ts, codex.ts, cursor.ts
  core/generators/merge.ts   ←  commands/shared.ts
```

**Rule**: Nothing in `src/core/generators/` or `src/core/fingerprint/*-builder.ts` may import from `src/cli/`. The dependency is strictly one-way: CLI → core.

---

## Key Data Structures

### RepoFingerprint
The central normalized model. All generators consume it; nothing reads the filesystem directly after collection.

```
RepoFingerprint {
  schemaVersion: string          // "1.0.0"
  generatedAt:   string          // ISO timestamp (excluded from hash)
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
  primaryFramework?: string      // computed — fullstack > backend > frontend priority

  contentHash:   string          // SHA-256 (excludes repoRoot, generatedAt, contentHash)
}
```

Every Signal type carries a `confidence: 'high' | 'medium' | 'low'` field. Generators use this to decide whether to include questionable detections.

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
               | 'append'        // append if content not already present
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

### AIQuestion
Returned by `generateQuestionnaire()`. Presented to the user in Part B of the interviewer.

```
AIQuestion {
  id:       string                        // answer key in qa map
  category: 'rules' | 'workflow' | 'agents' | 'architect'
  text:     string                        // question text shown to user
  context:  string                        // why the AI thinks this matters
  type:     'yesno' | 'choice' | 'text'
  choices?: string[]                      // for 'choice' type
  default?: string                        // pre-selected answer
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

Executed once per repo. Runs up to 4 AI calls, an interactive interviewer, multiple generators, and installs the git hook.

```
User: openskulls init [path]
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 0 — Select AI engine + tools                              │
  │  circleMultiselect() → user picks tool(s)                       │
  │  detectAICLIFor(selectedToolIds) → AICLIAdapter                 │
  │  Fatal if no matching CLI found in PATH.                        │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AICLIAdapter { command, invoke, version }
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 1 — Fingerprint collection                                 │
  │                                                                  │
  │  AIFingerprintCollector.collect(repoRoot, config?, logger?, adapter?)│
  │    ├─ scanRepo()          → fileTree[], configFiles Map          │
  │    ├─ readConfigContents()→ config file contents (≤32 KB each)   │
  │    ├─ detectAICLIs()      → AICLISignal[] (pure, no AI)          │
  │    ├─ buildAnalysisPrompt()→ prompt string (Handlebars)          │
  │    ├─ invokeAICLI()  [AI CALL 1 — fatal]                        │
  │    │      stdin → claude -p -                                    │
  │    │      response → AIAnalysisResponse (Zod-validated)          │
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
  │  Step 3 — AI questionnaire (skipped with --yes)                  │
  │                                                                  │
  │  generateQuestionnaire(fingerprint)  [AI CALL 2 — non-fatal]    │
  │    prompt: buildQuestionnairePrompt(fingerprint)                 │
  │    response → AIQuestion[] (0–8 repo-specific questions)         │
  │    Returns [] on failure                                         │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AIQuestion[]
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 4 — Interviewer (skipped with --yes)                       │
  │                                                                  │
  │  runInterviewer({ yes }, aiQuestions)                            │
  │    Part A: Static — auto-docs, auto-commit, architect, subagents │
  │    Part B: Dynamic — AI questions (yesno/choice/text)            │
  │    Returns: UserContext { workflowConfig, qa }                   │
  └────────────────────────────┬────────────────────────────────────┘
                               │ UserContext
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Steps 5–6 — Skills generation                                   │
  │                                                                  │
  │  Sequential (default):                                           │
  │    generateAISkills(fingerprint, logger, qa)  [AI CALL 3]        │
  │    generateArchitectSkill(...)  [AI CALL 4 — if architectEnabled]│
  │                                                                  │
  │  Parallel (useSubagents = true):                                 │
  │    Promise.allSettled([Call 3, Call 4])                          │
  │                                                                  │
  │  Both non-fatal — [] / skipped on error                          │
  └────────────────────────────┬────────────────────────────────────┘
                               │ AISkill[] (architect prepended if enabled)
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 7 — File generation (pure, no I/O)                         │
  │                                                                  │
  │  toolsToGenerate = user-selected ∪ fingerprint.aiCLIs            │
  │  selectGenerators(toolsToGenerate).flatMap(g => g.generate(…))   │
  └────────────────────────────┬────────────────────────────────────┘
                               │ GeneratedFile[]
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 8 — Show generation plan                                   │
  │  For each GeneratedFile: resolve abs path, check create/update   │
  └────────────────────────────┬────────────────────────────────────┘
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Step 9 — Confirm  [skipped with --yes or --dry-run]             │
  │  confirm({ message: 'Write these files?' }) via @clack/prompts  │
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
  selectGenerators(activeTools).flatMap(g => g.generate(…))
  where: activeTools = Set(['claude_code', ...fingerprint.aiCLIs.map(a => a.tool)])
         │
         ▼
  Show plan → confirm() → Write files → saveFingerprint()
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
  hasDrifted(current, baseline)?
    ├─ NO  → exit 0
    └─ YES → generate + write silently → saveFingerprint() → exit 0
```

All hook operations are wrapped in a top-level `try/catch`. The hook always exits 0.

---

## AI Pipeline

Up to four sequential AI CLI invocations during `init`. Each is a subprocess call with a Handlebars-rendered prompt.

```
                           RepoFingerprint
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
   Call 1: Analysis       Call 2: Questions      Call 3: Skills
   ─────────────────       ─────────────────     ──────────────────
   analysis.md.hbs         questionnaire          skills.md.hbs
   + fileTree              .md.hbs                + fingerprint
   + configContents        + fingerprint          + qa answers
                           summary
   → AIAnalysisResponse    → AIQuestion[]         → AISkill[]
   [FATAL]                 [NON-FATAL]            [NON-FATAL]

          Call 4 (optional, if architectEnabled):
          ─────────────────────────────────────────
          architect.md.hbs
          + fingerprint summary + workflowConfig + qa
          → AISkill (single, prepended to skills list)
          [NON-FATAL]
```

**Prompt template → builder function mapping:**

| Template | Builder | Called from |
|---|---|---|
| `analysis.md.hbs` | `buildAnalysisPrompt()` | `AIFingerprintCollector.collect()` |
| `questionnaire.md.hbs` | `buildQuestionnairePrompt()` | `generateQuestionnaire()` |
| `skills.md.hbs` | `buildSkillsPrompt()` | `generateAISkills()` |
| `architect.md.hbs` | `buildArchitectPrompt()` | `generateArchitectSkill()` |

All builder functions are **pure** — they take data and return a string. No I/O, no side effects.

**Common invocation path in `invokeAICLI()`:**

```
stdin mode (claude):
  spawn("claude", ["-p", "-"])
  → write prompt to child.stdin
  → collect stdout
  → resolve(stdout) on exit(0) | reject on timeout or exit(!0)

arg mode (copilot, codex):
  spawn("copilot", ["-p", "...prompt..."])
  → collect stdout
  → resolve / reject as above

powershell mode (Windows copilot):
  spawn("powershell.exe", ["-NoProfile", "-Command", "copilot -p $env:__OPENSKULLS_PROMPT"],
    { env: { __OPENSKULLS_PROMPT: prompt } })
  ⚠ Known issue: long multi-line prompts may be mangled — see Task I-3

After collecting output:
  stripJsonFences(raw)   ← removes ```json ... ``` wrappers
  JSON.parse(cleaned)
  Schema.parse(data)     ← Zod validates; throws ZodError on mismatch
```

**Timeout**: 120 seconds per call. On timeout, the child process is killed and the call rejects.

---

## Generator System

### Interface contract

```typescript
interface Generator {
  toolId:         string            // "claude_code" | "copilot" | "codex" | "cursor"
  toolName:       string            // "Claude Code"
  detectionFiles: readonly string[] // signals this tool is in use in the repo

  generate(input: GeneratorInput): GeneratedFile[]
  // MUST be: pure, stateless, deterministic, side-effect-free
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
  │    Rendered via templates/claude-code/CLAUDE.md.hbs
  │    Sections: overview, tech_stack, architecture, conventions,
  │              testing, cicd, workflow_rules, agent_guidance
  ├─ .claude/commands/run-tests.md          base=repo,  replace  (if testing detected)
  ├─ .claude/commands/commit.md             base=repo,  replace  (if conventional commits)
  ├─ .claude/skills.md                      base=repo,  merge_sections  (if aiSkills present)
  ├─ .claude/skills/<id>/SKILL.md           base=repo,  replace  (one per AISkill)
  └─ .claude/settings.json                  base=repo,  replace

CopilotGenerator (toolId: "copilot")
  └─ .github/copilot-instructions.md        base=repo,  merge_sections

CodexGenerator (toolId: "codex")
  └─ AGENTS.md                              base=repo,  merge_sections

CursorGenerator (toolId: "cursor")
  └─ .cursor/rules/project.mdc             base=repo,  merge_sections
       YAML frontmatter: alwaysApply: true
```

### Registry

All generators are registered in `src/core/generators/registry.ts`:

```typescript
export function getBuiltinGenerators(): Generator[] {
  return [
    new ClaudeCodeGenerator(),
    new CopilotGenerator(),
    new CodexGenerator(),
    new CursorGenerator(),
  ]
}

export function selectGenerators(toolIds: ReadonlySet<string>): Generator[] {
  return getBuiltinGenerators().filter(g => toolIds.has(g.toolId))
}
```

Both `init.ts` and `sync.ts` call `selectGenerators()`. Adding a new built-in generator requires only registering it in the registry — no changes to command files.

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
  ## Overview                               ## Overview         ← REPLACED
  Old AI-generated overview                 New AI-generated overview
  <!-- /openskulls:section:overview -->     <!-- /openskulls:section:overview -->

  ## My Custom Section                      ## My Custom Section← preserved
  Hand-written by developer.                Hand-written by developer.

  <!-- openskulls:section:tech_stack -->    <!-- openskulls:section:tech_stack -->
  Old tech stack                            New tech stack      ← REPLACED
  <!-- /openskulls:section:tech_stack -->   <!-- /openskulls:section:tech_stack -->

                                            <!-- openskulls:section:new_section -->
                                            New section         ← APPENDED
                                            <!-- /openskulls:section:new_section -->
```

**Rules:**
- Section in both old and new → new version replaces old
- Section only in old → kept as-is (template dropped it; preserve anyway)
- Section only in new → appended at end
- Manual text → never touched

The implementation (`parse → map → rebuild`) is a pure function with no I/O. See `src/core/generators/merge.ts`.

---

## Drift Detection

After `init`, the fingerprint is saved to `.openskulls/fingerprint.json`. On every `sync`, a fresh fingerprint is collected and compared by content hash.

```
contentHash = SHA-256(
  JSON.stringify(
    { all fingerprint fields EXCEPT repoRoot, generatedAt, contentHash },
    (key, value) => sort object keys for determinism
  )
)

hasDrifted(current, baseline):
  return current.contentHash !== baseline.contentHash
```

The hash is machine-independent: it excludes the absolute `repoRoot` path and the ephemeral `generatedAt` timestamp. The same codebase produces the same hash on any machine.

**What causes drift:**
- Language/framework detected or removed
- Version change in a core dependency
- Testing framework changed
- Linting tools added or removed
- Conventional commits style flipped
- Architecture style reclassified
- AI CLI context files added

**What does NOT cause drift:**
- Timestamps
- Machine paths
- Fields in `HASH_EXCLUDE` in `types.ts`

---

## Config File Reference

### `.openskulls/config.toml`
Written by `openskulls init`, updated by `openskulls sync`. Committed with the repo.

```toml
schema_version = "1.0.0"

# Which AI context generators are active for this repo.
[[targets]]
name    = "claude_code"
enabled = true

[[targets]]
name    = "cursor"
enabled = true

# Paths excluded from repo analysis and the file tree sent to AI.
exclude_paths = [
  "node_modules", ".git", "dist", "build",
  ".venv", "__pycache__", ".next", ".nuxt", "coverage"
]

[workflow]
auto_docs         = "ask"     # "always" | "ask" | "never"
auto_commit       = "ask"     # "always" | "ask" | "never"
architect_enabled = false
architect_domain  = ""        # blank = auto-detect from project signals
architect_review  = "ask"     # "always" | "ask" | "never"
use_subagents     = false     # true = run skills + architect in parallel

# Saved answers from the AI questionnaire (keys = AIQuestion.id).
# Fed back into skills and architect AI calls.
[workflow.answers]
testing_strategy    = "unit+integration"
deployment_target   = "vercel"
```

### `.openskulls/fingerprint.json`
Written by `init` and `sync`. Used for drift detection. Do not edit by hand.

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
  "frameworks": [...],
  "conventions": [...],
  "dependencies": [...],
  "testing": { "framework": "vitest", "pattern": "tests/**/*.test.ts", "coverageTool": "v8" },
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

### `.claude/skills/<id>/SKILL.md`
One per AI-generated skill. YAML frontmatter + markdown body.

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

Installed at `.git/hooks/post-commit` by `openskulls init`.

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
- `command -v openskulls` guard: silently exits if binary not on PATH (e.g. after global uninstall without hook removal)
- Passes changed filenames to `shouldTriggerSync()` — skips AI call if no trigger-pattern file changed
- Always exits `0` — advisory, never blocking
- Idempotent: `installGitHook()` checks for `HOOK_MARKER` before writing

**Default trigger patterns** (files that cause a hook-mode sync):
```
package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb
requirements*.txt, pyproject.toml, Pipfile, Pipfile.lock
go.mod, go.sum, Cargo.toml, Cargo.lock
Gemfile, Gemfile.lock, tsconfig*.json, .github/workflows/**
```

---

## Test Strategy

### What is tested

| Layer | Coverage | How |
|---|---|---|
| Zod schemas + `createFingerprint`, `hasDrifted` | ✅ | Direct function calls |
| `detectAICLIs()`, `stripJsonFences()` | ✅ | Pure function tests |
| `AISkill` / `AISkillsResponse` schema validation | ✅ | Zod parse tests |
| `mergeSections()`, `parseChunks()`, `extractSections()` | ✅ | Pure function tests |
| `ClaudeCodeGenerator.generate()` | ✅ | Assert on `GeneratedFile[]` |
| `CopilotGenerator` content builder | ✅ | Pure function tests |
| `CursorGenerator` content builder | ✅ | Pure function tests |
| `matchesTriggerPattern()`, `shouldTriggerSync()` | ✅ | Pure function tests |

### What is not tested

| Gap | Why | Path forward |
|---|---|---|
| `AIFingerprintCollector.collect()` E2E | Requires spawning a real AI CLI | Integration test with mock CLI (Task A-5) |
| `invokeAICLI()` subprocess | Subprocess mocking is fragile | Mock via `AICLIAdapter` injection |
| `init.ts` / `sync.ts` orchestration | Complex async + interactive prompts | Integration test with `--yes --dry-run` |
| PowerShell invocation path | Platform-specific | Manual test on Windows (Task I-3) |
| `mergeSections()` with malformed markers | Edge cases not all covered | Additional unit tests (Task A-5) |
| Config TOML load/parse | `loadWorkflowConfig()` not directly tested | Unit test with temp files |

### Test helper

`tests/helpers/index.ts` exports `makeContext(files: Record<string, string>)` which creates a real temp directory tree, returns `{ ctx, dir, cleanup }`, and guarantees cleanup after each test. Use this for any test that needs a filesystem.

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
    // Pure — no I/O, no network, no filesystem reads
    const content = `# Context for ${fingerprint.repoName}\n`
    return [repoFile('.mytool/context.md', content, 'merge_sections')]
  }
}
```

2. Register in `src/core/generators/registry.ts`:

```typescript
import { MyToolGenerator } from './my-tool.js'

export function getBuiltinGenerators(): Generator[] {
  return [
    new ClaudeCodeGenerator(),
    new CopilotGenerator(),
    new CodexGenerator(),
    new CursorGenerator(),
    new MyToolGenerator(),   // ← add here
  ]
}
```

3. Add detection logic in `detectAICLIs()` in `ai-collector.ts` if the tool leaves config files in the repo (so it's auto-included in sync).

4. Add the tool ID to `ALL_TARGETS` in `init.ts` (so `config.toml` tracks it).

5. Write tests in `tests/generators/<name>.test.ts` using `makeContext()`.

That's it — no changes to `init.ts` or `sync.ts`. The registry handles selection.

### Add a new top-level command

Use the `/add-command` skill or follow this pattern:

1. Create `src/cli/commands/<name>.ts` with a `register<Name>(program: Command)` function
2. Import and call it in `src/cli/index.ts`
3. Use `@clack/prompts` for interactive prompts (see `src/cli/ui/prompts.ts` for the `circleMultiselect` pattern)
4. Use `AIFingerprintCollector` + generators as needed

### Add a new fingerprint field

1. Add the field to the relevant Zod schema in `src/core/fingerprint/types.ts`
2. Update `buildAnalysisPrompt()` in `prompt-builder.ts` to ask the AI for it
3. Update `AIAnalysisResponse` in `ai-collector.ts` if the field comes from the AI
4. Update any generators that should use the field
5. Update `HASH_EXCLUDE` in `types.ts` only if the field should not trigger drift detection

### Add new AI prompt templates

All prompt templates are Handlebars (`.md.hbs`) files under `templates/prompts/`. To add or modify:

1. Edit or add a `.hbs` file under `templates/prompts/`
2. The corresponding `*-builder.ts` loads it via `readFileSync` + `Handlebars.compile()`
3. No TypeScript changes are needed if template variable names are unchanged

### Add a new config field

1. Add the field to the Zod schema in `src/core/config/types.ts`
2. Update `saveConfig()` in `init.ts` to write it to `config.toml`
3. Update `loadWorkflowConfig()` if reading it back is needed
4. Update the Config File Reference section in this document

---

## Architecture Decision Records

### ADR-1: AI-first analysis (no language parsers)

**Context**: Initial design had hand-written parsers for Python, JS/TS, Go. These were accurate for known languages but blind to anything else, required maintenance per-language, and couldn't detect conventions or architecture style.

**Decision**: Replace all parsers with a single AI prompt that receives the file tree and config file contents. Validate the response with Zod. The local code does only the filesystem work that's cheaper than asking the AI: directory walking and file reading.

**Consequences**: Zero language-specific code. New languages, frameworks, and conventions are detected automatically. The AI call is the new performance bottleneck (120s timeout). Quality depends on prompt clarity and AI capability.

---

### ADR-2: Generators as pure functions

**Context**: Easy to write generators that call `fs.readFileSync()` or `fetch()` inline. Makes testing complex.

**Decision**: `generate()` must be a pure function. All state flows in via `GeneratorInput`. All I/O stays in the CLI layer.

**Consequences**: Generators are unit-testable with `assert(file.content)` — no filesystem mocking. The CLI layer owns all write concerns (merge strategy, path resolution, dry-run). Adding dry-run, diff preview, or CI mode requires zero changes to generators.

---

### ADR-3: HTML comments for section markers (not a custom syntax)

**Context**: Needed a way to identify auto-generated blocks in Markdown files without breaking rendering.

**Decision**: Use HTML comments `<!-- openskulls:section:id -->` because they are invisible in rendered Markdown, supported by all parsers, and unambiguous even if the user edits the file.

**Consequences**: Markers survive editing in any Markdown editor. The regex-based parser in `merge.ts` is simple. Downside: markers are verbose; users sometimes delete them accidentally.

---

### ADR-4: SHA-256 content hash over the whole fingerprint

**Context**: Needed a reliable, machine-independent signal for "did the repo change in a meaningful way?"

**Decision**: Hash the entire fingerprint JSON (sorted keys, excluding `repoRoot`, `generatedAt`, `contentHash`). Any signal change — including minor version bumps, new frameworks, or linting tools — triggers regeneration.

**Consequences**: Very sensitive drift detection. False positives are possible (AI re-classifies something slightly differently). Could add per-field granularity later, but the simple `string !== string` check is reliable enough for v0.1.

---

### ADR-5: Interactive prompts via @clack/prompts

**Context**: Initial implementation used raw `readline/promises` with numbered menus, requiring users to type `1`, `2`, `3`.

**Decision**: Replace with `@clack/prompts` for arrow-key selection (select, confirm, text) and a custom `circleMultiselect` renderer using `@clack/core`'s `MultiSelectPrompt` with ●/○ circles instead of ◼/◻ squares.

**Consequences**: Better UX. The `circleMultiselect` is a ~70-line wrapper that must be kept in sync with `@clack/core`'s `MultiSelectPrompt` API. The `--yes` flag bypasses all interactive prompts.

---

## Known Implementation Gaps

These are places where the current code diverges from the ideal design. Each is a known trade-off, not a surprise.

| Gap | Location | Impact | Tracking |
|---|---|---|---|
| `sync.ts` reads `fingerprint.aiCLIs` for generator selection, not `config.targets` | `sync.ts` | If a user selected Cursor during `init` but detection didn't find it in `aiCLIs`, sync won't regenerate `.cursor/rules/project.mdc` | Task A-4 |
| `personalFile()` and `home` FileBase have no callers | `base.ts` | API surface defined but unused — no generator emits personal files yet | Needed for personal skills (`~/.claude/commands/`) |
| `append` merge strategy has no callers | `shared.ts` | Implemented but no generator produces a file with `mergeStrategy: 'append'` | Will be used when package rules are appended |
| Skills/architect AI calls run in `--dry-run` | `init.ts` | Costs money to preview; output can't be shown | Task A-3 |
| Prompt summary built independently in 3 builders | `skills-prompt.ts`, `questionnaire-builder.ts`, `architect-builder.ts` | Duplication — convention changes require 3 edits | Task A-1 |
| `verbose` output interleaves with spinners | `init.ts` | Timing issue — verbose blocks displayed while spinner is active | Task A-6 |
| Schema version not checked on fingerprint/config load | `cache.ts`, `config/types.ts` | Silent data loss possible on major version upgrade | Task A-4 |
| PowerShell prompt delivery fragile | `ai-collector.ts` | Multi-line prompts may be mangled on Windows | Task I-3 |
| No integration tests for full pipeline | `tests/` | Orchestration bugs undetectable | Task A-5 |
| Stub commands exposed in `--help` | `add.ts`, `audit.ts`, `publish.ts` | User confusion | Task B-1 |

---

## Invariants to Preserve

| Invariant | Location |
|---|---|
| Generators must never write files | `src/core/generators/` |
| All schemas are Zod, types are inferred | `src/core/*/types.ts` |
| `contentHash` excludes `repoRoot`, `generatedAt`, `contentHash` | `types.ts: HASH_EXCLUDE` |
| Hook always exits 0 | `hook.ts`, `sync.ts: hookMode` |
| `claude` prompts go via stdin; arg-style only for CLIs without stdin support | `ai-collector.ts: AICLIAdapter.invoke` |
| `mergeSections` is pure — no filesystem access | `merge.ts` |
| Fingerprint is the only channel from collector to generators | architecture |
| `src/core/` never imports from `src/cli/` | module boundary |
| AI calls 2–4 are non-fatal; only call 1 is fatal | `init.ts`, `sync.ts` |

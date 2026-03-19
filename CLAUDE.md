# openskulls

<!-- openskulls:section:overview -->
## Project Overview

CLI tool.
Makes your repo readable to AI agents, then keeps it readable as the code evolves.
Primary language: **TypeScript**.

<!-- /openskulls:section:overview -->

<!-- openskulls:section:tech_stack -->
## Tech Stack

- **TypeScript** 5.5.0 *(primary)* — 100% of source files
### Frameworks & Libraries
- **commander** 12.1.0 (cli)
- **zod** 3.23.8 (utility)
- **handlebars** 4.7.8 (utility)
- **simple-git** 3.25.0 (utility)
- **chalk** 5.3.0 (utility)
- **ora** 8.1.0 (utility)
- **smol-toml** 1.3.1 (utility)
- **@clack/prompts** 1.0.1 (utility)
- **bun test** (built-in test runner)

<!-- /openskulls:section:tech_stack -->

<!-- openskulls:section:architecture -->
## Architecture

**Style**: CLI tool


**Entry points**:
- `src/index.ts`
**Module structure**:
- `src/cli/commands/`
- `src/core/fingerprint/`
- `src/core/generators/`
- `src/core/packages/`
- `src/core/config/`
- `src/cli/ui/`
- `templates/`
- `tests/`

<!-- /openskulls:section:architecture -->

<!-- openskulls:section:conventions -->
## Conventions

- **Nodenext Esm**: `NodeNext`
- **Typescript Strict**: `strict`
- **Zod Types**: `z.infer&lt;typeof Schema&gt;`
- **Generators No Io**: `GeneratedFile[] return only`
**Linting/Formatting**: eslint

<!-- /openskulls:section:conventions -->

<!-- openskulls:section:testing -->
## Testing

- **Framework**: bun test (built-in)
- **Pattern**: `tests/**/*.test.ts`
- **Coverage**: bun --coverage

<!-- /openskulls:section:testing -->

<!-- openskulls:section:agent_guidance -->
## Agent Guidance


- Before making changes, read the relevant module's code to understand existing patterns.
- Run the test suite before proposing a commit.
- Do not modify files outside the scope of the current task.

<!-- /openskulls:section:agent_guidance -->

---

## Key Files

> Manually maintained — preserved across `openskulls sync`.

| Path | Purpose |
|---|---|
| `src/core/fingerprint/types.ts` | Zod schemas, `createFingerprint()`, `hasDrifted()` |
| `src/core/fingerprint/ai-collector.ts` | `AIFingerprintCollector`, `AICLIAdapter`, `detectAICLI()`, `detectAICLIFor()`, `invokeAICLI()`, `detectAICLIs()`, `normaliseAnalysisResponse()`, `stripJsonFences()` |
| `src/core/fingerprint/prompt-builder.ts` | `buildAnalysisPrompt()` — pure, builds AI analysis prompt |
| `src/core/fingerprint/questionnaire-builder.ts` | `generateQuestionnaire()`, `buildQuestionnairePrompt()` |
| `src/core/fingerprint/skills-builder.ts` | `generateAISkills()`, `AISkill` Zod schema |
| `src/core/fingerprint/skills-prompt.ts` | `buildSkillsPrompt()` — pure, no I/O |
| `src/core/fingerprint/architect-builder.ts` | `generateArchitectSkill()`, `buildArchitectPrompt()` |
| `src/core/fingerprint/cache.ts` | `loadFingerprint()`, `saveFingerprint()` |
| `src/core/generators/base.ts` | `GeneratedFile`, `BaseGenerator`, `repoFile()`, `personalFile()` |
| `src/core/generators/claude-code.ts` | `ClaudeCodeGenerator` — renders CLAUDE.md via Handlebars, emits skills |
| `src/core/generators/copilot.ts` | `CopilotGenerator` — emits `.github/copilot-instructions.md` |
| `src/core/generators/codex.ts` | `CodexGenerator` — emits `AGENTS.md` |
| `src/core/generators/cursor.ts` | `CursorGenerator` — emits `.cursor/rules/project.mdc` |
| `src/core/generators/registry.ts` | `getBuiltinGenerators()`, `selectGenerators()` — central generator registry |
| `src/core/generators/merge.ts` | `mergeSections()` — pure section merge, no I/O |
| `src/core/generators/shared.ts` | `STYLE_LABELS`, `isConventionalCommits()`, `buildWorkflowRuleLines()` |
| `src/core/generators/workspace-aggregate.ts` | `buildWorkspaceMapSection()` — renders workspace table for root instructions |
| `src/cli/commands/init.ts` | Full init flow: detect engine → analyse → questionnaire → interview → skills → generate → write |
| `src/cli/commands/sync.ts` | Sync flow: interactive mode + non-blocking hook mode |
| `src/cli/commands/hook.ts` | `installGitHook()`, `shouldTriggerSync()`, `matchesTriggerPattern()` |
| `src/cli/commands/shared.ts` | `writeGeneratedFile()` — applies merge strategy, shared by init + sync |
| `src/cli/commands/interviewer.ts` | `runInterviewer()` — static workflow Qs (Part A) + AI Qs (Part B) |
| `src/cli/ui/console.ts` | `log.*`, `panel()`, `table()`, `spinner()`, `fatal()` |
| `templates/claude-code/CLAUDE.md.hbs` | Handlebars template with tagged sections |
| `templates/prompts/analysis.md.hbs` | AI repo analysis prompt template |
| `templates/prompts/skills.md.hbs` | AI skills generation prompt template |
| `templates/prompts/questionnaire.md.hbs` | AI questionnaire prompt template |
| `templates/prompts/architect.md.hbs` | AI architect skill prompt template |
| `templates/prompts/methodology.md.hbs` | Methodology skills prompt template |
| `templates/prompts/guardrails.md.hbs` | Architect guardrails prompt template |
| `templates/prompts/foreign-file-import.md.hbs` | Foreign file AI import prompt template |
| `src/core/packages/manifest.ts` | `SkullPackManifest` Zod schema for pack TOML format |
| `src/core/packages/loader.ts` | `loadInstalledPacks()`, pack-to-SkullPackage transformation |
| `src/core/fingerprint/methodology-prompt.ts` | `buildMethodologyPrompt()` — pure, builds methodology AI prompt |
| `src/core/fingerprint/methodology-builder.ts` | `generateMethodologySkills()`, `MethodologySkillsResponse` schema |
| `src/core/fingerprint/guardrails-builder.ts` | `isComplexProject()`, `generateArchitectGuardrails()`, `buildGuardrailsPrompt()` |
| `src/core/fingerprint/workspace-types.ts` | `WorkspaceFingerprint`, `WorkspaceMapEntry` types |
| `src/core/fingerprint/workspace-discovery.ts` | `discoverWorkspaces()` — monorepo workspace scanning |
| `src/core/fingerprint/workspace-collector.ts` | `collectWorkspaceFingerprints()`, `buildAggregateFingerprint()` |
| `src/core/fingerprint/workspace-cache.ts` | Per-workspace fingerprint I/O (`saveWorkspaceFingerprint()`, `loadAllWorkspaceFingerprints()`) |
| `src/core/fingerprint/foreign-file-types.ts` | `ForeignFileContext`, `ForeignFileScan` types |
| `src/core/fingerprint/foreign-file-detector.ts` | `scanForeignFiles()`, `isForeignFile()`, `MANAGED_INSTRUCTION_FILES` |
| `src/core/fingerprint/foreign-file-importer.ts` | `importForeignFiles()`, `mergeForeignContextIntoQA()` |
| `src/core/config/types.ts` | `loadEnabledTargets()`, `loadWorkflowConfig()`, `loadWorkspaceConfig()`, Zod config schemas |
| `src/cli/commands/add.ts` | `registerAdd()` — `openskulls add github:user/repo` |
| `src/cli/commands/remove.ts` | `registerRemove()` — `openskulls remove <name>` |
| `src/cli/commands/list.ts` | `registerList()` — `openskulls list` |
| `tests/helpers/index.ts` | `makeContext(files)` test factory (creates real temp dirs) |

---

## MVP Status

| Step | Task | Status |
|---|---|---|
| 1 | Data models — RepoFingerprint, SkullPackage, configs | ✅ |
| 2 | AI-powered fingerprint collection — `AIFingerprintCollector` + `buildAnalysisPrompt` | ✅ |
| 3 | Claude Code / Copilot / Codex generators — CLAUDE.md, AGENTS.md, copilot-instructions.md | ✅ |
| 4 | Wire `openskulls init` — collect → questionnaire → interview → skills → generate → write | ✅ |
| 5 | Interviewer — static workflow Qs + AI-generated contextual Qs | ✅ |
| 6 | Git hook installer + non-blocking `openskulls sync` (interactive + hook modes) | ✅ |
| T-AI | AI-generated skills — second AI call, emits `.claude/skills/` + per-skill SKILL.md | ✅ |
| T-6 | Architect skill — optional third AI call, domain-expert `/architect-review` command | ✅ |
| R-1 | Generator refactor — extract shared helpers into `generators/shared.ts` | ✅ |
| R-2 | Generator registry — `getBuiltinGenerators()` to replace hardcoded init/sync branching | ✅ |
| R-3 | Wire registry into CLI — replace hardcoded generator instantiation | ✅ |
| 7 | Dependency drift check + `openskulls audit` command | ⬜ |
| P-1 | Git-native skill packs — `InstalledPackEntry`, `SkullPackManifest`, `loadInstalledPacks()` | ✅ |
| P-2 | Methodology skills — `generateMethodologySkills()`, wired into init + sync | ✅ |
| P-3 | Pack emission — `ClaudeCodeGenerator` emits pack skills as `.claude/skills/<pack>-<id>/SKILL.md` | ✅ |
| P-4 | `openskulls add` — git-native packs (github: + local symlink) | ✅ |
| P-5 | `openskulls remove` + `openskulls list` commands | ✅ |
| R-4 | Multi-role review agents — preset roles (architect, security, performance, etc.) + user-defined custom roles; each role generates its own `/role-review` SKILL.md via AI call; role selection during `init` with stack-aware preset suggestions; roles stored in `.openskulls/config.toml` and regenerated on sync | ⬜ |

<!-- openskulls:section:workflow_rules -->
## Workflow Rules

- **Documentation**: After adding or updating a feature, always update README.md and any relevant documentation files before marking the task complete.
- **Commits**: After completing a feature or fix, stage the relevant changed files and create a git commit with an appropriate message.

<!-- /openskulls:section:workflow_rules -->
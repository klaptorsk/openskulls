<!-- openskulls:section:skills -->
# Project Skills

> Auto-generated — run `openskulls sync` to update.
> Each skill lives at `.claude/skills/<id>/SKILL.md` and is available as a `/<id>` slash command.

## Debugging

### Debug the AI Analysis Pipeline
`/debug-ai-pipeline` — Use when the AI fingerprint collection or skills generation is failing, producing bad JSON, or timing out. Triggers: claude -p, AIFingerprintCollector, invokeAICLI, stripJsonFences, Zod parse error, AI response, skills-builder, generateAISkills.

## Testing

### Write a Vitest Test
`/write-test` — Use when adding or fixing tests in the openskulls test suite. Triggers: vitest, test file, describe, it, expect, makeContext, temp dir, test helper, unit test, integration test.

## Workflow

### Add a New AI Engine
`/add-ai-engine` — Use when adding support for a new AI coding CLI engine (detection, repo signals, generator, init wiring). Triggers: new AI tool, new engine, AICLIAdapter, AI_CLI_CANDIDATES, detectAICLIs, AICLISignal, ENGINE_TO_TOOL, ALL_TARGETS, cursor, windsurf, cline, codex.

### Add a CLI Command
`/add-command` — Use when adding a new top-level command to the openskulls CLI. Triggers: new command, new subcommand, commander, program.command, argv, CLI action.

### Add a Config Field
`/add-config-field` — Use when adding new fields to ProjectConfig or GlobalConfig. Triggers: config field, config.toml, ProjectConfig, GlobalConfig, smol-toml, config schema, openskulls config.

### Add a File Generator
`/add-generator` — Use when adding a new generator that emits files into the user's repo. Triggers: new generator, GeneratedFile, repoFile, personalFile, Handlebars template, generated output file.

### Add or Modify a Handlebars Template
`/add-template` — Use when creating or editing a Handlebars template for generated output files. Triggers: .hbs file, Handlebars template, CLAUDE.md template, section tags, merge_sections, template helper.

### Extend the Repo Fingerprint Schema
`/extend-fingerprint` — Use when adding new detected fields to RepoFingerprint or the AI analysis response. Triggers: new fingerprint field, RepoFingerprint schema, AIAnalysisResponse, Zod schema, fingerprint drift, contentHash.

<!-- /openskulls:section:skills -->
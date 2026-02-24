<!-- openskulls:section:skills -->
# Project Skills

> Auto-generated — run `openskulls sync` to update.
> Each skill lives at `.claude/skills/<id>/SKILL.md` and is available as a `/<id>` slash command.

## Debugging

### Debug AI Analysis Pipeline
`/debug-ai-pipeline` — Use when the AI fingerprint collection or skills generation is failing, returning bad JSON, or producing incorrect analysis. Triggers: AI analysis fails, bad JSON, claude -p, stdin prompt, stripJsonFences, AIFingerprintCollector, invokeAICLI, skills generation error.

## Refactoring

### Extend the Fingerprint Schema
`/extend-fingerprint` — Use when adding new fields to the RepoFingerprint data model or modifying what the AI analysis collects. Triggers: new fingerprint field, schema change, add to fingerprint, RepoFingerprint, Zod schema update, analysis prompt.

## Testing

### Write a Vitest Test
`/write-test` — Use when adding or updating tests for any module in this project. Triggers: write test, add test, vitest, test file, makeContext, unit test, integration test, failing test.

## Workflow

### Add a CLI Command
`/add-command` — Use when adding a new top-level command to the openskulls CLI. Triggers: new command, new subcommand, commander, program.command, cli action.

### Add a Config Field
`/add-config-field` — Use when adding new fields to ProjectConfig or GlobalConfig that are persisted to config.toml. Triggers: new config option, config field, ProjectConfig, GlobalConfig, config.toml, smol-toml, user preference, persist setting.

### Add a File Generator
`/add-generator` — Use when adding a new generator that produces AI-readable output files. Triggers: new generator, GeneratedFile, BaseGenerator, emit file, generate output, template render.

### Add a Handlebars Template
`/add-template` — Use when adding or modifying a Handlebars template that generators render into output files. Triggers: new template, .hbs file, Handlebars, template context, tagged sections, openskulls:section.

<!-- /openskulls:section:skills -->
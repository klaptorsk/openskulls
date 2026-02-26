---
name: add-template
description: >
  Use when creating or editing a Handlebars template for generated output files.
  Triggers: .hbs file, Handlebars template, CLAUDE.md template, section tags, merge_sections, template helper.
---

# Add or Modify a Handlebars Template

Reference for working with Handlebars templates that control generated file content in openskulls.

## Core Rules

- All templates live in `templates/` — subdirectory mirrors the generator name (e.g. `templates/claude-code/`)
- Section tags use the format `<!-- openskulls:section:<name> -->` ... `<!-- /openskulls:section:<name> -->` for mergeable regions
- Only sections inside these tags are preserved during `openskulls sync` — content outside is regenerated
- Template variables come from `RepoFingerprint` — do not introduce ad-hoc data shapes
- Use `{{#if field}}` guards for optional fingerprint fields so templates degrade gracefully when fields are absent
- Do not put logic in templates — use Handlebars helpers registered in the generator for any transformation
- Template filenames must end in `.hbs`

## Key Files

| File | Purpose |
|---|---|
| `templates/claude-code/CLAUDE.md.hbs` | Primary CLAUDE.md template — reference implementation |
| `src/core/generators/claude-code.ts` | Loads and renders `CLAUDE.md.hbs`, registers helpers |
| `src/core/generators/merge.ts` | `mergeSections()` — parses section tags for merge logic |

## Pattern

```handlebars
{{! templates/my-output/file.md.hbs }}
# {{project.name}}

<!-- openskulls:section:overview -->
## Overview
{{project.description}}
<!-- /openskulls:section:overview -->

{{#if tech.frameworks}}
## Frameworks
{{#each tech.frameworks}}
- **{{this.name}}** {{this.version}}
{{/each}}
{{/if}}
```

## Anti-Patterns

- Do not hardcode project-specific values in templates — all dynamic content must come from `RepoFingerprint`
- Do not nest section tags — `mergeSections()` does not support nested sections
- Do not add Handlebars helpers inside the `.hbs` file — register them in the generator's TypeScript file

## Checklist

- [ ] Template file created in correct `templates/<generator>/` subdirectory
- [ ] Optional fields guarded with `{{#if}}`
- [ ] Section tags added for any user-editable regions
- [ ] Generator updated to load and render the new template
- [ ] Output visually reviewed with a real fingerprint
- [ ] `npm test` passes
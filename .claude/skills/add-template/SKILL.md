---
name: add-template
description: >
  Use when creating or editing a Handlebars template for generated output files.
  Triggers: .hbs file, Handlebars template, CLAUDE.md template, section tags, merge_sections, template helper.
---

# Add or Edit a Handlebars Template

Reference for authoring Handlebars templates that generators render into `GeneratedFile` content.

## Core Rules

- Templates live in `templates/` — subdirectory mirrors the generator name (e.g. `templates/claude-code/`)
- Prompt templates live in `templates/prompts/`
- Section tags use the form `<!-- openskulls:section:name -->` … `<!-- /openskulls:section:name -->` for `mergeSections()` to work
- The merge strategy `merge_sections` preserves user edits inside tagged sections across syncs — never remove tags from an existing template
- Pass only the fields you need from `RepoFingerprint` as template context — do not pass the whole object blindly
- Register custom Handlebars helpers in the generator file before calling `Handlebars.compile()`
- Use `{{{tripleStash}}}` for pre-rendered HTML/markdown that must not be escaped

## Pattern

```handlebars
<!-- templates/claude-code/CLAUDE.md.hbs -->
<!-- openskulls:section:overview -->
## Project Overview

{{projectName}} — {{description}}

<!-- /openskulls:section:overview -->

<!-- openskulls:section:tech_stack -->
## Tech Stack

{{#each languages}}
- **{{name}}** {{version}}
{{/each}}

<!-- /openskulls:section:tech_stack -->
```

```typescript
// In generator — compile and render
const tpl = Handlebars.compile(templateSource)
const rendered = tpl({ projectName, description, languages })
```

## Anti-Patterns

- Do not remove `<!-- openskulls:section:* -->` tags from existing templates — breaks user merge
- Do not use `{{expression}}` for markdown content that contains `>`, `<` — use `{{{tripleStash}}}`
- Do not put logic-heavy conditionals in templates — precompute in the generator and pass booleans
- Do not hardcode file paths inside templates — receive them as template context

## Checklist

- [ ] Template file placed in correct `templates/` subdirectory
- [ ] Section tags added for every mergeable block
- [ ] Template context type defined and passed correctly from generator
- [ ] Custom helpers registered before `Handlebars.compile()`
- [ ] Generator unit test renders the template and asserts key strings
- [ ] `npm test` passes
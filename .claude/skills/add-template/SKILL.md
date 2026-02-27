---
name: add-template
description: >
  Use when creating or editing a Handlebars template for generated output files.
  Triggers: .hbs file, Handlebars template, CLAUDE.md template, section tags, merge_sections, template helper.
---

# Create or Edit a Handlebars Template

Reference for authoring and modifying the Handlebars templates that generators use to produce output files.

## Core Rules

- All templates live under `templates/` — never inline large template strings in TypeScript source
- Templates that support section-merge must wrap each mergeable region with `<!-- openskulls:section:<name> -->` / `<!-- /openskulls:section:<name> -->` tags
- The merge engine in `src/core/generators/merge.ts` preserves user content in tagged sections across syncs — any content NOT in a section tag is considered generator-owned and will be replaced
- Handlebars helpers are registered in the generator file that loads the template — keep helpers pure and side-effect free
- Use `{{#if field}}...{{/if}}` guards for optional fingerprint fields so templates render safely when fields are absent
- Prompt templates (under `templates/prompts/`) must include a concrete JSON example matching the current Zod schema so the AI knows the exact output shape

## Key Files

```
templates/claude-code/CLAUDE.md.hbs     — primary CLAUDE.md template (section-merge enabled)
templates/prompts/analysis.md.hbs       — AI fingerprint analysis prompt
templates/prompts/skills.md.hbs         — AI skills generation prompt
templates/prompts/questionnaire.md.hbs  — AI questionnaire prompt
templates/prompts/architect.md.hbs      — AI architect skill prompt
src/core/generators/merge.ts            — mergeSections(), parseChunks(), extractSections()
```

## Pattern

```handlebars
<!-- openskulls:section:my_section -->
## My Section

{{#if fingerprint.myField}}
- **{{fingerprint.myField}}**
{{/if}}
{{#each fingerprint.items}}
- {{this.name}}: {{this.value}}
{{/each}}

<!-- /openskulls:section:my_section -->
```

## Anti-Patterns

- Do not put business logic in templates — compute derived values in the generator and pass them as template variables
- Do not omit section tags on regions users are expected to edit — they will be overwritten on next sync
- Do not modify `templates/prompts/` without also updating the matching Zod schema and vice versa

## Checklist

- [ ] Template saved under `templates/<generator>/`
- [ ] Mergeable user-editable sections wrapped with `<!-- openskulls:section:<name> -->` tags
- [ ] All optional fields guarded with `{{#if}}`
- [ ] Generator updated to load and compile the template
- [ ] `npm test` passes (snapshot or content tests updated if needed)
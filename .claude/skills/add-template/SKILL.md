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

## Section Tags in Use

| Section tag | Used in | Purpose |
|---|---|---|
| `overview` | CLAUDE.md, copilot-instructions, AGENTS.md, project.mdc | Project description + primary stack |
| `tech_stack` | CLAUDE.md, copilot-instructions, AGENTS.md, project.mdc | Languages + frameworks |
| `architecture` | CLAUDE.md, copilot-instructions, AGENTS.md, project.mdc | Style, entry points, module structure |
| `workspace_map` | CLAUDE.md, copilot-instructions, AGENTS.md | Monorepo workspace table |
| `conventions` | CLAUDE.md, copilot-instructions, AGENTS.md, project.mdc | Linting, formatting, naming |
| `testing` | CLAUDE.md, copilot-instructions, AGENTS.md | Test framework + patterns |
| `cicd` | CLAUDE.md | CI/CD platform + deploy targets |
| `workflow_rules` | CLAUDE.md, copilot-instructions, AGENTS.md | Auto-docs, auto-commit policies |
| `architect_guardrails` | CLAUDE.md, copilot-instructions, AGENTS.md | Module ownership, layer rules, forbidden patterns |
| `agent_guidance` | CLAUDE.md, copilot-instructions, AGENTS.md, project.mdc | Commit format, scope constraints |
| `skills` | AGENTS.md | Codex agent skills listing |

## Key Files

```
templates/claude-code/CLAUDE.md.hbs          — primary CLAUDE.md template (section-merge enabled)
templates/prompts/analysis.md.hbs            — AI fingerprint analysis prompt
templates/prompts/skills.md.hbs              — AI skills generation prompt
templates/prompts/questionnaire.md.hbs       — AI questionnaire prompt
templates/prompts/architect.md.hbs           — AI architect skill prompt
templates/prompts/methodology.md.hbs         — Methodology skills prompt
templates/prompts/guardrails.md.hbs          — Architect guardrails prompt
templates/prompts/foreign-file-import.md.hbs — Foreign file AI import prompt
src/core/generators/merge.ts                 — mergeSections(), parseChunks(), extractSections()
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
- Do not use the same section tag name across templates that render different content — tags are matched by name during merge

## Checklist

- [ ] Template saved under `templates/<generator>/`
- [ ] Mergeable user-editable sections wrapped with `<!-- openskulls:section:<name> -->` tags
- [ ] All optional fields guarded with `{{#if}}`
- [ ] Generator updated to load and compile the template
- [ ] `bun test` passes (snapshot or content tests updated if needed)

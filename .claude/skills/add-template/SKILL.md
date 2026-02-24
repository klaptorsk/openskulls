---
name: add-template
description: >
  Use when adding or modifying a Handlebars template that generators render into output files.
  Triggers: new template, .hbs file, Handlebars, template context, tagged sections, openskulls:section.
---

# Add a Handlebars Template

Reference for adding Handlebars templates used by generators to produce AI-readable output files.

## Core Rules

- All templates live under `templates/<generator-name>/` and are read by the generator at runtime
- Use `<!-- openskulls:section:<name> -->` / `<!-- /openskulls:section:<name> -->` tags to mark regions that `mergeSections()` can update without clobbering user edits outside them
- Keep logic out of templates — compute all derived values in the generator TypeScript code before calling `Handlebars.compile()`
- Template filenames match the output filename with `.hbs` appended (e.g. `CLAUDE.md.hbs` → `CLAUDE.md`)
- Escape Handlebars delimiters with `\{{` when the output file itself uses `{{` syntax (e.g. GitHub Actions)
- Register Handlebars helpers in the generator constructor, not in the template file

## Key Files

- `templates/claude-code/CLAUDE.md.hbs` — Primary template example with section tags
- `src/core/generators/claude-code.ts` — How the template is loaded, compiled, and rendered
- `src/core/generators/merge.ts` — `mergeSections()` uses the `openskulls:section:` tags from templates
- `src/core/generators/base.ts` — `repoFile()` / `personalFile()` wrap rendered output

## Anti-Patterns

- Do not use `{{#if}}` or `{{#each}}` for complex conditional logic — move that to the TypeScript template context
- Do not put section tags inside other section tags — `mergeSections()` does not support nesting
- Do not hardcode user-specific values in templates — all dynamic content must come from the generator context object
- Do not add a new template without updating the corresponding generator to load and render it

## Checklist

- [ ] Template file created under `templates/<generator-name>/<filename>.hbs`
- [ ] Generator updated to load and compile the new template
- [ ] Section tags added for any regions users might customize
- [ ] `mergeSections()` called in the generator for files with section tags
- [ ] Template renders correctly for both empty and populated fingerprint data
- [ ] `npm test` passes
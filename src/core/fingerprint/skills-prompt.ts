/**
 * buildSkillsPrompt — constructs the AI skills generation prompt.
 *
 * Pure function: no I/O, no side effects, fully deterministic.
 *
 * Generated skills follow the Claude Code SKILL.md convention:
 *   .claude/skills/<id>/SKILL.md
 *
 * Each SKILL.md is a rich reference document — not a thin command template.
 * The `description` is a trigger description (when Claude should auto-load this skill).
 * The `content` is a full markdown reference with core rules, file paths,
 * code patterns, anti-patterns, and a checklist.
 */

import type { RepoFingerprint } from './types.js'

export function buildSkillsPrompt(fingerprint: RepoFingerprint): string {
  const {
    repoName,
    description,
    primaryLanguage,
    primaryFramework,
    languages,
    frameworks,
    conventions,
    testing,
    linting,
    architecture,
  } = fingerprint

  const parts: string[] = []

  parts.push(`Project: ${repoName}`)
  if (description) parts.push(`Description: ${description}`)
  if (primaryLanguage) parts.push(`Primary language: ${primaryLanguage}`)
  if (primaryFramework) parts.push(`Primary framework: ${primaryFramework}`)

  if (languages.length > 0) {
    const langs = languages
      .map((l) => `${l.name}${l.version ? ` ${l.version}` : ''}`)
      .join(', ')
    parts.push(`Languages: ${langs}`)
  }

  if (frameworks.length > 0) {
    const fws = frameworks
      .map((f) => `${f.name}${f.version ? ` ${f.version}` : ''} (${f.category})`)
      .join(', ')
    parts.push(`Frameworks: ${fws}`)
  }

  if (testing) {
    const pat = testing.pattern ? ` (${testing.pattern})` : ''
    parts.push(`Testing: ${testing.framework}${pat}`)
  }

  if (linting && linting.tools.length > 0) {
    parts.push(`Linting: ${linting.tools.join(', ')}`)
  }

  if (architecture.style !== 'unknown') {
    parts.push(`Architecture: ${architecture.style}`)
  }

  const relevantConventions = conventions.filter((c) => c.value !== undefined)
  if (relevantConventions.length > 0) {
    const convStr = relevantConventions
      .map((c) => `${c.name}=${c.value}`)
      .join(', ')
    parts.push(`Conventions: ${convStr}`)
  }

  const projectSummary = parts.join('\n')

  return `You are generating Claude Code SKILL.md files for a software project. Return ONLY a JSON object — no explanation, no markdown fences, no commentary.

Project context:
${projectSummary}

Generate 5–10 project-specific skills covering the most important recurring tasks a developer performs in this codebase. Each skill becomes a file at .claude/skills/<id>/SKILL.md and creates a /<id> slash command in Claude Code.

The JSON must match this schema exactly:

{
  "skills": [
    {
      "id": "add-api-endpoint",
      "title": "Add an API Endpoint",
      "description": "Use when adding new REST endpoints to the backend. Triggers: new route, controller, handler, API endpoint, HTTP method.",
      "content": "# Add an API Endpoint\\n\\nReference for adding new REST endpoints following project conventions.\\n\\n## Core Rules\\n\\n- All routes go in \`src/routes/\`\\n- Validate input with Zod schemas defined in \`src/schemas/\`\\n- Never put business logic in route handlers — delegate to service layer\\n\\n## Pattern\\n\\n\`\`\`typescript\\n// src/routes/users.ts\\nrouter.post('/users', validate(CreateUserSchema), async (req, res) => {\\n  const user = await userService.create(req.body)\\n  res.status(201).json(user)\\n})\\n\`\`\`\\n\\n## Anti-Patterns\\n\\n- Do not query the database directly from route handlers\\n- Do not skip input validation\\n\\n## Checklist\\n\\n- [ ] Route added to correct router file\\n- [ ] Zod schema defined for request body\\n- [ ] Unit test written for the handler\\n- [ ] \`npm test\` passes",
      "category": "workflow"
    }
  ]
}

Field rules:
- "id": kebab-case, lowercase letters and numbers only, no spaces — becomes the directory name and slash command (e.g. "add-api-endpoint")
- "title": human-readable Title Case (e.g. "Add an API Endpoint")
- "description": 1–3 sentences. Starts with "Use when...". Lists trigger keywords after "Triggers:" — these help Claude auto-detect when to load this skill
- "content": the full markdown body of the SKILL.md file. Must follow this structure:
    1. \`# <title>\` — H1 heading matching the title field
    2. One sentence context paragraph
    3. \`## Core Rules\` — 3–8 non-negotiable rules specific to this project's conventions and file structure
    4. \`## Pattern\` or \`## Key Files\` — concrete code example OR file paths with purpose (use actual paths from this project)
    5. \`## Anti-Patterns\` — 2–4 specific things to avoid with brief explanation
    6. \`## Checklist\` — markdown checklist of steps to verify before finishing the task
    - Use real file paths and conventions from the project context above
    - Encode the project's actual stack, naming conventions, and architecture constraints
    - Keep it dense and reference-grade — this is loaded as expert context, not read like prose
    - Escape all double quotes and newlines in the JSON string value (\\" and \\n)
- "category": exactly one of "workflow", "testing", "debugging", "refactoring", "documentation", "devops", "other"
- Do not generate skills with ids "run-tests" or "commit" — those are reserved built-in skills

Return only the JSON object. No markdown fences. No explanation.`
}

# Platform Play Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add git-native skill packs and AI-generated methodology skills to openskulls, making it a full AI agent infrastructure platform.

**Architecture:** Two independent feature tracks that converge at the generator layer. Track A (skill packs) adds `openskulls add/remove/list` commands + pack loader. Track B (methodology skills) adds a new AI generation phase. Both feed into the existing `GeneratorInput.aiSkills` and `GeneratorInput.installedPackages` fields.

**Tech Stack:** TypeScript, Zod, smol-toml, simple-git, commander, Handlebars, vitest

**Spec:** `docs/superpowers/specs/2026-03-17-platform-play-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `src/core/packages/manifest.ts` | `SkullPackManifest` Zod schema (TOML on-disk format) |
| `src/core/packages/loader.ts` | `loadInstalledPacks()`, `installPack()`, `removePack()` |
| `src/core/fingerprint/methodology-prompt.ts` | `buildMethodologyPrompt()` — pure function |
| `src/core/fingerprint/methodology-builder.ts` | `generateMethodologySkills()` — async AI call |
| `src/cli/commands/add.ts` | `registerAdd()` — `openskulls add` command |
| `src/cli/commands/remove.ts` | `registerRemove()` — `openskulls remove` command |
| `src/cli/commands/list.ts` | `registerList()` — `openskulls list` command |
| `templates/prompts/methodology.md.hbs` | Methodology skills prompt template |
| `tests/packages/manifest.test.ts` | Manifest schema tests |
| `tests/packages/loader.test.ts` | Pack loader tests |
| `tests/fingerprint/methodology-builder.test.ts` | Methodology prompt + schema tests |
| `tests/generators/claude-code-packs.test.ts` | Generator pack skill emission tests |

### Modified Files

| File | Change |
|---|---|
| `src/core/packages/types.ts` | Add `InstalledPackEntry` Zod schema |
| `src/core/fingerprint/skills-builder.ts` | Expand `AISkill.category` enum |
| `src/core/generators/claude-code.ts` | Emit pack skills as `.claude/skills/<pack>-<id>/SKILL.md` |
| `src/cli/commands/init.ts` | Add methodology generation step, load installed packs |
| `src/cli/commands/sync.ts` | Load packs, regenerate methodology skills |
| `src/cli/index.ts` | Register `add`, `remove`, `list` commands |

---

## Task 1: Add `InstalledPackEntry` type to packages/types.ts

**Files:**
- Modify: `src/core/packages/types.ts:92` (after `LockfileEntry`)
- Test: `tests/packages/manifest.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/packages/manifest.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { InstalledPackEntry } from '../../src/core/packages/types.js'

describe('InstalledPackEntry schema', () => {
  it('parses a valid github entry', () => {
    const result = InstalledPackEntry.parse({
      name: 'react-patterns',
      source: 'github',
      sourceUrl: 'github:user/react-patterns#v1.0.0',
      installedAt: '2026-03-17T00:00:00Z',
    })
    expect(result.name).toBe('react-patterns')
    expect(result.source).toBe('github')
  })

  it('parses a valid local entry', () => {
    const result = InstalledPackEntry.parse({
      name: 'my-pack',
      source: 'local',
      sourceUrl: '../local/path',
      installedAt: '2026-03-17T00:00:00Z',
    })
    expect(result.source).toBe('local')
  })

  it('rejects an invalid source', () => {
    expect(() => InstalledPackEntry.parse({
      name: 'x',
      source: 'npm',
      sourceUrl: 'x',
      installedAt: 'x',
    })).toThrow()
  })

  it('requires all fields', () => {
    expect(() => InstalledPackEntry.parse({ name: 'x' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/packages/manifest.test.ts`
Expected: FAIL — `InstalledPackEntry` not found in `types.ts`

- [ ] **Step 3: Implement InstalledPackEntry**

Add to `src/core/packages/types.ts` after the `Lockfile` schema:

```typescript
// ─── InstalledPackEntry ─────────────────────────────────────────────────────

export const InstalledPackEntry = z.object({
  name: z.string(),
  source: z.enum(['github', 'local']),
  sourceUrl: z.string(),
  installedAt: z.string(),
})
export type InstalledPackEntry = z.infer<typeof InstalledPackEntry>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/packages/manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/packages/types.ts tests/packages/manifest.test.ts
git commit -m "feat: add InstalledPackEntry type for git-native skill packs"
```

---

## Task 2: Create SkullPackManifest schema

**Files:**
- Create: `src/core/packages/manifest.ts`
- Test: `tests/packages/manifest.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/packages/manifest.test.ts`:

```typescript
import { SkullPackManifest, ManifestSkillEntry, ManifestRuleEntry } from '../../src/core/packages/manifest.js'

describe('ManifestSkillEntry schema', () => {
  it('parses a valid skill entry', () => {
    const result = ManifestSkillEntry.parse({
      id: 'add-component',
      path: 'skills/add-component/SKILL.md',
      category: 'workflow',
      tool_compatibility: [],
    })
    expect(result.id).toBe('add-component')
  })

  it('rejects id with uppercase', () => {
    expect(() => ManifestSkillEntry.parse({
      id: 'AddComponent',
      path: 'skills/x.md',
    })).toThrow()
  })

  it('defaults category to workflow', () => {
    const result = ManifestSkillEntry.parse({ id: 'test-skill', path: 'x.md' })
    expect(result.category).toBe('workflow')
  })

  it('defaults tool_compatibility to empty', () => {
    const result = ManifestSkillEntry.parse({ id: 'test-skill', path: 'x.md' })
    expect(result.tool_compatibility).toEqual([])
  })
})

describe('ManifestRuleEntry schema', () => {
  it('parses a valid rule entry', () => {
    const result = ManifestRuleEntry.parse({
      id: 'no-class-components',
      path: 'rules/no-class.md',
    })
    expect(result.section).toBe('codeStyle')
    expect(result.severity).toBe('warn')
  })
})

describe('SkullPackManifest schema', () => {
  it('parses a complete manifest', () => {
    const result = SkullPackManifest.parse({
      schema_version: '1.0.0',
      name: 'react-patterns',
      description: 'React conventions',
      author: 'someone',
      tags: ['react'],
      applies_when: { frameworks: ['react'], languages: ['typescript'] },
      skills: [{ id: 'add-component', path: 'skills/add-component/SKILL.md' }],
      rules: [{ id: 'no-class', path: 'rules/no-class.md' }],
    })
    expect(result.name).toBe('react-patterns')
    expect(result.skills).toHaveLength(1)
    expect(result.rules).toHaveLength(1)
  })

  it('parses a minimal manifest (name + description only)', () => {
    const result = SkullPackManifest.parse({
      name: 'minimal-pack',
      description: 'A minimal pack',
    })
    expect(result.skills).toEqual([])
    expect(result.rules).toEqual([])
    expect(result.tags).toEqual([])
  })

  it('rejects missing name', () => {
    expect(() => SkullPackManifest.parse({ description: 'x' })).toThrow()
  })

  it('rejects missing description', () => {
    expect(() => SkullPackManifest.parse({ name: 'x' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/packages/manifest.test.ts`
Expected: FAIL — `manifest.ts` doesn't exist

- [ ] **Step 3: Implement the manifest schema**

Create `src/core/packages/manifest.ts`:

```typescript
/**
 * SkullPackManifest — Zod schema for the on-disk skull-pack.toml format.
 *
 * This is the TOML manifest that lives at the root of a skill pack git repo.
 * The loader (loader.ts) transforms this into the in-memory SkullPackage type
 * by reading file contents from the referenced paths.
 */

import { z } from 'zod'

export const ManifestSkillEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string(),
  category: z.string().default('workflow'),
  tool_compatibility: z.array(z.string()).default([]),
})
export type ManifestSkillEntry = z.infer<typeof ManifestSkillEntry>

export const ManifestRuleEntry = z.object({
  id: z.string(),
  path: z.string(),
  section: z.string().default('codeStyle'),
  severity: z.enum(['error', 'warn', 'info']).default('warn'),
})
export type ManifestRuleEntry = z.infer<typeof ManifestRuleEntry>

export const SkullPackManifest = z.object({
  schema_version: z.string().default('1.0.0'),
  name: z.string(),
  description: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  applies_when: z.object({
    frameworks: z.array(z.string()).default([]),
    languages: z.array(z.string()).default([]),
  }).default({ frameworks: [], languages: [] }),
  skills: z.array(ManifestSkillEntry).default([]),
  rules: z.array(ManifestRuleEntry).default([]),
})
export type SkullPackManifest = z.infer<typeof SkullPackManifest>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/packages/manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/packages/manifest.ts tests/packages/manifest.test.ts
git commit -m "feat: add SkullPackManifest Zod schema for pack TOML format"
```

---

## Task 3: Create pack loader

**Files:**
- Create: `src/core/packages/loader.ts`
- Create: `tests/packages/loader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/packages/loader.test.ts`:

```typescript
import { describe, expect, it, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadInstalledPacks } from '../../src/core/packages/loader.js'

function makeTempRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'openskulls-loader-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function writePackFiles(repoRoot: string, packName: string, manifest: string, files: Record<string, string> = {}): void {
  const packDir = join(repoRoot, '.openskulls', 'packs', packName)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, 'skull-pack.toml'), manifest, 'utf-8')
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(packDir, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }
}

let cleanup: (() => void) | undefined

afterEach(() => { cleanup?.(); cleanup = undefined })

describe('loadInstalledPacks', () => {
  it('returns empty array when no packs directory exists', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const result = await loadInstalledPacks(dir)
    expect(result).toEqual([])
  })

  it('loads a pack with one skill', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const manifest = `
name = "test-pack"
description = "A test pack"

[[skills]]
id = "add-widget"
path = "skills/add-widget/SKILL.md"
category = "workflow"
`
    writePackFiles(dir, 'test-pack', manifest, {
      'skills/add-widget/SKILL.md': '# Add Widget\n\nSome content.',
    })
    const packs = await loadInstalledPacks(dir)
    expect(packs).toHaveLength(1)
    expect(packs[0].name).toBe('test-pack')
    expect(packs[0].skills).toHaveLength(1)
    expect(packs[0].skills[0].id).toBe('add-widget')
    expect(packs[0].skills[0].content).toContain('# Add Widget')
  })

  it('loads a pack with one rule', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const manifest = `
name = "rule-pack"
description = "A rule pack"

[[rules]]
id = "no-any"
path = "rules/no-any.md"
section = "codeStyle"
severity = "error"
`
    writePackFiles(dir, 'rule-pack', manifest, {
      'rules/no-any.md': 'Do not use `any` type.',
    })
    const packs = await loadInstalledPacks(dir)
    expect(packs).toHaveLength(1)
    expect(packs[0].rules).toHaveLength(1)
    expect(packs[0].rules[0].content).toContain('Do not use')
  })

  it('skips packs with invalid manifest', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const packDir = join(dir, '.openskulls', 'packs', 'bad-pack')
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, 'skull-pack.toml'), 'this is not valid toml [[[', 'utf-8')
    const packs = await loadInstalledPacks(dir)
    expect(packs).toEqual([])
  })

  it('skips packs with missing referenced skill file', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const manifest = `
name = "missing-file-pack"
description = "Has a missing skill file"

[[skills]]
id = "ghost"
path = "skills/ghost/SKILL.md"
`
    writePackFiles(dir, 'missing-file-pack', manifest)
    // Note: no actual skill file written
    const packs = await loadInstalledPacks(dir)
    expect(packs).toEqual([])
  })

  it('loads multiple packs', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    writePackFiles(dir, 'pack-a', 'name = "pack-a"\ndescription = "A"', {})
    writePackFiles(dir, 'pack-b', 'name = "pack-b"\ndescription = "B"', {})
    const packs = await loadInstalledPacks(dir)
    expect(packs).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/packages/loader.test.ts`
Expected: FAIL — `loader.ts` doesn't exist

- [ ] **Step 3: Implement the pack loader**

Create `src/core/packages/loader.ts`:

```typescript
/**
 * Pack loader — reads installed skill packs from .openskulls/packs/.
 *
 * loadInstalledPacks() globs for skull-pack.toml manifests, reads referenced
 * skill/rule files, and assembles SkullPackage objects for the generators.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as tomlParse } from 'smol-toml'
import { SkullPackManifest } from './manifest.js'
import type { SkullPackage, Skill, Rule } from './types.js'

export async function loadInstalledPacks(repoRoot: string): Promise<SkullPackage[]> {
  const packsDir = join(repoRoot, '.openskulls', 'packs')

  let entries: string[]
  try {
    entries = await readdir(packsDir)
  } catch {
    return []
  }

  const packs: SkullPackage[] = []

  for (const entry of entries) {
    const packDir = join(packsDir, entry)
    const manifestPath = join(packDir, 'skull-pack.toml')

    try {
      const info = await stat(packDir)
      if (!info.isDirectory()) continue

      const raw = await readFile(manifestPath, 'utf-8')
      const parsed = tomlParse(raw)
      const manifest = SkullPackManifest.parse(parsed)

      // Read skill file contents
      const skills: Skill[] = []
      for (const s of manifest.skills) {
        const content = await readFile(join(packDir, s.path), 'utf-8')
        skills.push({
          id: s.id,
          name: s.id,
          description: '',
          content,
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: s.tool_compatibility,
        })
      }

      // Read rule file contents
      const rules: Rule[] = []
      for (const r of manifest.rules) {
        const content = await readFile(join(packDir, r.path), 'utf-8')
        rules.push({
          id: r.id,
          name: r.id,
          description: '',
          content,
          severity: r.severity,
          section: r.section,
          tags: [],
          toolCompatibility: [],
        })
      }

      packs.push({
        schemaVersion: manifest.schema_version,
        name: manifest.name,
        version: '0.0.0',
        description: manifest.description,
        author: manifest.author,
        tags: manifest.tags,
        appliesWhen: {
          frameworks: manifest.applies_when.frameworks,
          languages: manifest.applies_when.languages,
        },
        skills,
        rules,
        contextSections: {},
        dependencies: [],
        peerDependencies: [],
      })
    } catch {
      // Skip invalid packs silently
      continue
    }
  }

  return packs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/packages/loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/packages/loader.ts tests/packages/loader.test.ts
git commit -m "feat: add pack loader for git-native skill packs"
```

---

## Task 4: Expand AISkill category enum

**Files:**
- Modify: `src/core/fingerprint/skills-builder.ts:20`
- Modify: `tests/fingerprint/skills-builder.test.ts:181`

- [ ] **Step 1: Write the failing test**

Add test to `tests/fingerprint/skills-builder.test.ts` inside the `'AISkill schema'` describe block:

```typescript
  it('accepts methodology categories', () => {
    const methodologyCategories = ['methodology', 'process', 'security'] as const
    for (const category of methodologyCategories) {
      expect(() => AISkill.parse(makeValidSkill({ category }))).not.toThrow()
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fingerprint/skills-builder.test.ts`
Expected: FAIL — `methodology` is not a valid category

- [ ] **Step 3: Expand the enum**

In `src/core/fingerprint/skills-builder.ts` line 20, change:

```typescript
  category:    z.enum(['workflow', 'testing', 'debugging', 'refactoring', 'documentation', 'devops', 'other']),
```

to:

```typescript
  category:    z.enum(['workflow', 'testing', 'debugging', 'refactoring', 'documentation', 'devops', 'methodology', 'process', 'security', 'other']),
```

- [ ] **Step 4: Update the existing "accepts all valid categories" test**

In `tests/fingerprint/skills-builder.test.ts` update the `categories` array in the `'accepts all valid categories'` test to include the new categories:

```typescript
    const categories = ['workflow', 'testing', 'debugging', 'refactoring', 'documentation', 'devops', 'methodology', 'process', 'security', 'other'] as const
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/fingerprint/skills-builder.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/fingerprint/skills-builder.ts tests/fingerprint/skills-builder.test.ts
git commit -m "feat: expand AISkill category enum with methodology, process, security"
```

---

## Task 5: Create methodology prompt template

**Files:**
- Create: `templates/prompts/methodology.md.hbs`

- [ ] **Step 1: Create the prompt template**

Create `templates/prompts/methodology.md.hbs`:

```handlebars
{{!--
  Methodology prompt — sent to the AI CLI to generate project-specific
  methodology skills (architect, workflow, verify, tdd).

  Template variables (Handlebars triple-brace = unescaped):
    {{{projectContext}}}  — structured project context from fingerprint
    {{{installedSkills}}} — list of installed pack skill IDs (deduplication)
    {{{taskSkillIds}}}    — list of already-generated task skill IDs
    {{hasTesting}}        — boolean: whether testing framework was detected
--}}
You are generating methodology SKILL.md files for a software project. These skills encode project-specific development processes — NOT task recipes. Return ONLY a JSON object — no explanation, no markdown fences, no commentary.

Project context:
{{{projectContext}}}

{{#if installedSkills}}
Installed skills (do not duplicate — skip any methodology already covered):
{{{installedSkills}}}

{{/if}}
{{#if taskSkillIds}}
Existing task skills (reference these in methodology where relevant):
{{{taskSkillIds}}}

{{/if}}
Generate the following methodology skills:

1. "architect" (category: "methodology") — Boundary enforcement and feature placement.
   - Map each module directory to its semantic responsibility
   - Define placement rules: where new features, services, types, tests go
   - Define layer rules: which modules can import from which
   - Define extension patterns: how to add a new X following existing design
   - List anti-patterns: specific architectural violations to avoid
   - Use REAL paths from the project context above

2. "workflow-lifecycle" (category: "methodology") — Commit, docs, and feature lifecycle.
   - Commit message format based on detected git conventions
   - Which documentation files to update when code changes
   - Feature completion protocol: implement → test → lint → document → commit
   - What "done" means in this project
   - Reference other methodology skills by /<id>

3. "verify" (category: "methodology") — Pre-completion verification checklist.
   - Exact commands to run before claiming work is done (test, lint, build, typecheck)
   - Convention checks specific to this project
   - Integration checks for cross-module changes
   - Use actual command names and paths from project context

{{#if hasTesting}}
4. "tdd" (category: "process") — Test-driven development grounded in this project.
   - Reference the detected test framework, runner, pattern, helpers
   - Show a real test structure example following this project's patterns
   - Specify what to mock vs what to use real instances of
   - Coverage tool and expectations if detected
{{/if}}

The JSON must match this schema exactly:

{
  "skills": [
    {
      "id": "architect",
      "title": "Architecture Guide",
      "description": "Use when placing new code, adding features, or creating new modules. Triggers: new file, new module, where to put, architecture.",
      "content": "# Architecture Guide\n\n...",
      "category": "methodology"
    }
  ]
}

Field rules:
- "id": exactly one of "architect", "workflow-lifecycle", "verify", "tdd" — no other ids
- "title": human-readable Title Case
- "description": 1-3 sentences. Starts with "Use when...". Lists trigger keywords after "Triggers:"
- "content": full markdown body of the SKILL.md file. Must follow this structure:
    1. `# <title>` — H1 heading matching the title field
    2. One sentence context paragraph
    3. `## Core Rules` — 3-8 non-negotiable rules using REAL file paths and conventions from this project
    4. `## Pattern` or `## Key Files` — concrete code example OR file paths with purpose
    5. `## Anti-Patterns` — 2-4 specific things to avoid with brief explanation
    6. `## Checklist` — markdown checklist of steps to verify
    - Use real file paths and conventions from the project context above
    - Encode the project's actual stack, naming conventions, and architecture constraints
    - Keep it dense and reference-grade
    - Escape all double quotes and newlines in the JSON string value (\" and \n)
- "category": exactly one of "methodology", "process"
- Do not generate skills with ids "run-tests", "commit", or "architect-review" — those are reserved

Return only the JSON object. No markdown fences. No explanation.
```

- [ ] **Step 2: Commit**

```bash
git add templates/prompts/methodology.md.hbs
git commit -m "feat: add methodology prompt template"
```

---

## Task 6: Create methodology prompt builder (pure function)

**Files:**
- Create: `src/core/fingerprint/methodology-prompt.ts`
- Create: `tests/fingerprint/methodology-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/fingerprint/methodology-builder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { buildMethodologyPrompt } from '../../src/core/fingerprint/methodology-prompt.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'

function makeFingerprint(
  overrides: Partial<Parameters<typeof createFingerprint>[0]> = {},
) {
  return createFingerprint({
    repoRoot: '/tmp/test-repo',
    repoName: 'test-repo',
    ...overrides,
  })
}

describe('buildMethodologyPrompt', () => {
  it('includes project name', () => {
    const fp = makeFingerprint({ repoName: 'my-app' })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('my-app')
  })

  it('includes module structure', () => {
    const fp = makeFingerprint({
      architecture: {
        style: 'cli',
        entryPoints: ['src/index.ts'],
        moduleStructure: ['src/core/', 'src/cli/', 'src/utils/'],
        hasMigrations: false,
      },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('src/core/')
    expect(prompt).toContain('src/cli/')
  })

  it('includes entry points', () => {
    const fp = makeFingerprint({
      architecture: {
        style: 'cli',
        entryPoints: ['src/main.ts'],
        moduleStructure: [],
        hasMigrations: false,
      },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('src/main.ts')
  })

  it('includes testing info when present', () => {
    const fp = makeFingerprint({
      testing: { framework: 'vitest', pattern: '**/*.test.ts', confidence: 'high' },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('vitest')
    expect(prompt).toContain('tdd')
  })

  it('omits tdd section when no testing detected', () => {
    const fp = makeFingerprint()
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).not.toContain('"tdd"')
  })

  it('includes installed pack skill IDs for deduplication', () => {
    const fp = makeFingerprint()
    const prompt = buildMethodologyPrompt(fp, undefined, ['add-component', 'review-pr'])
    expect(prompt).toContain('add-component')
    expect(prompt).toContain('review-pr')
  })

  it('includes task skill IDs when provided', () => {
    const fp = makeFingerprint()
    const prompt = buildMethodologyPrompt(fp, undefined, undefined, ['add-api', 'write-test'])
    expect(prompt).toContain('add-api')
    expect(prompt).toContain('write-test')
  })

  it('includes conventions', () => {
    const fp = makeFingerprint({
      conventions: [
        { name: 'conventional_commits', value: 'true', confidence: 'high', evidence: [] },
      ],
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('conventional_commits')
  })

  it('includes git info when present', () => {
    const fp = makeFingerprint({
      git: { commitStyle: 'conventional_commits', branchStrategy: 'github_flow', primaryBranch: 'main', contributorsCount: 3 },
    })
    const prompt = buildMethodologyPrompt(fp)
    expect(prompt).toContain('conventional_commits')
    expect(prompt).toContain('main')
  })

  it('is deterministic', () => {
    const fp = makeFingerprint({ repoName: 'deterministic' })
    expect(buildMethodologyPrompt(fp)).toBe(buildMethodologyPrompt(fp))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fingerprint/methodology-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the prompt builder**

Create `src/core/fingerprint/methodology-prompt.ts`:

```typescript
/**
 * buildMethodologyPrompt — constructs the AI methodology skills generation prompt.
 *
 * The prompt template lives at templates/prompts/methodology.md.hbs.
 * This function assembles the dynamic project context from the fingerprint
 * and injects it into the template. Pure function — no I/O at call time.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import type { RepoFingerprint } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../../templates/prompts/methodology.md.hbs')
const TEMPLATE_SOURCE = readFileSync(TEMPLATE_PATH, 'utf-8')
const COMPILED = Handlebars.compile(TEMPLATE_SOURCE, { noEscape: true })

export function buildMethodologyPrompt(
  fingerprint: RepoFingerprint,
  qa?: Record<string, string>,
  installedPackSkillIds?: string[],
  taskSkillIds?: string[],
): string {
  const parts: string[] = []

  parts.push(`Project: ${fingerprint.repoName}`)
  if (fingerprint.description) parts.push(`Description: ${fingerprint.description}`)
  if (fingerprint.primaryLanguage) parts.push(`Primary language: ${fingerprint.primaryLanguage}`)
  if (fingerprint.primaryFramework) parts.push(`Primary framework: ${fingerprint.primaryFramework}`)

  if (fingerprint.languages.length > 0) {
    const langs = fingerprint.languages.map((l) => `${l.name}${l.version ? ` ${l.version}` : ''}`).join(', ')
    parts.push(`Languages: ${langs}`)
  }

  if (fingerprint.frameworks.length > 0) {
    const fws = fingerprint.frameworks.map((f) => `${f.name}${f.version ? ` ${f.version}` : ''} (${f.category})`).join(', ')
    parts.push(`Frameworks: ${fws}`)
  }

  parts.push(`Architecture: ${fingerprint.architecture.style}`)

  if (fingerprint.architecture.entryPoints.length > 0) {
    parts.push(`Entry points: ${fingerprint.architecture.entryPoints.join(', ')}`)
  }

  if (fingerprint.architecture.moduleStructure.length > 0) {
    parts.push(`Module structure:\n${fingerprint.architecture.moduleStructure.map((m) => `  - ${m}`).join('\n')}`)
  }

  if (fingerprint.architecture.apiStyle) parts.push(`API style: ${fingerprint.architecture.apiStyle}`)
  if (fingerprint.architecture.database) parts.push(`Database: ${fingerprint.architecture.database}`)

  if (fingerprint.testing) {
    const pat = fingerprint.testing.pattern ? ` (${fingerprint.testing.pattern})` : ''
    const cov = fingerprint.testing.coverageTool ? `, coverage: ${fingerprint.testing.coverageTool}` : ''
    parts.push(`Testing: ${fingerprint.testing.framework}${pat}${cov}`)
  }

  if (fingerprint.linting && fingerprint.linting.tools.length > 0) {
    parts.push(`Linting: ${fingerprint.linting.tools.join(', ')}`)
  }

  const relevantConventions = fingerprint.conventions.filter((c) => c.value !== undefined)
  if (relevantConventions.length > 0) {
    parts.push(`Conventions: ${relevantConventions.map((c) => `${c.name}=${c.value}`).join(', ')}`)
  }

  if (fingerprint.git) {
    parts.push(`Git: commit style=${fingerprint.git.commitStyle}, primary branch=${fingerprint.git.primaryBranch}`)
  }

  if (qa && Object.keys(qa).length > 0) {
    const qaLines = Object.entries(qa).map(([k, v]) => `- ${k}: ${v}`)
    parts.push(`User preferences:\n${qaLines.join('\n')}`)
  }

  const installedSkills = installedPackSkillIds && installedPackSkillIds.length > 0
    ? installedPackSkillIds.map((id) => `- ${id}`).join('\n')
    : ''

  const taskSkills = taskSkillIds && taskSkillIds.length > 0
    ? taskSkillIds.map((id) => `- ${id}`).join('\n')
    : ''

  return COMPILED({
    projectContext: parts.join('\n'),
    installedSkills,
    taskSkillIds: taskSkills,
    hasTesting: fingerprint.testing !== undefined,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fingerprint/methodology-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/fingerprint/methodology-prompt.ts tests/fingerprint/methodology-builder.test.ts
git commit -m "feat: add methodology prompt builder"
```

---

## Task 7: Create methodology builder (AI invocation)

**Files:**
- Create: `src/core/fingerprint/methodology-builder.ts`
- Modify: `tests/fingerprint/methodology-builder.test.ts` (append schema tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/fingerprint/methodology-builder.test.ts`:

```typescript
import { MethodologySkillsResponse } from '../../src/core/fingerprint/methodology-builder.js'

describe('MethodologySkillsResponse schema', () => {
  it('parses a valid response', () => {
    const data = {
      skills: [{
        id: 'architect',
        title: 'Architecture Guide',
        description: 'Use when placing new code.',
        content: '# Architecture Guide\n\n## Core Rules\n\n- Rule 1',
        category: 'methodology',
      }],
    }
    const result = MethodologySkillsResponse.parse(data)
    expect(result.skills).toHaveLength(1)
  })

  it('defaults skills to empty array', () => {
    const result = MethodologySkillsResponse.parse({})
    expect(result.skills).toEqual([])
  })

  it('rejects invalid methodology skill id', () => {
    expect(() => MethodologySkillsResponse.parse({
      skills: [{
        id: 'not-a-valid-methodology-id',
        title: 'X',
        description: 'X',
        content: 'X',
        category: 'methodology',
      }],
    })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fingerprint/methodology-builder.test.ts`
Expected: FAIL — `MethodologySkillsResponse` not found

- [ ] **Step 3: Implement the methodology builder**

Create `src/core/fingerprint/methodology-builder.ts`:

```typescript
/**
 * AI methodology skills builder — generates project-specific methodology
 * skills via an AI call.
 *
 * generateMethodologySkills() invokes the AI CLI with the fingerprint as
 * structured input and returns typed AISkill objects ready for the generator.
 */

import { z } from 'zod'
import { detectAICLI, invokeAICLI, stripJsonFences, type VerboseLogger } from './ai-collector.js'
import { buildMethodologyPrompt } from './methodology-prompt.js'
import type { RepoFingerprint } from './types.js'
import type { AISkill } from './skills-builder.js'

const VALID_METHODOLOGY_IDS = ['architect', 'workflow-lifecycle', 'verify', 'tdd'] as const

const MethodologySkill = z.object({
  id:          z.enum(VALID_METHODOLOGY_IDS),
  title:       z.string(),
  description: z.string(),
  content:     z.string(),
  category:    z.enum(['methodology', 'process', 'security']),
})

export const MethodologySkillsResponse = z.object({
  skills: z.array(MethodologySkill).default([]),
})
export type MethodologySkillsResponse = z.infer<typeof MethodologySkillsResponse>

export async function generateMethodologySkills(
  fingerprint: RepoFingerprint,
  logger?: VerboseLogger,
  qa?: Record<string, string>,
  installedPackSkillIds?: string[],
  taskSkillIds?: string[],
): Promise<AISkill[]> {
  const cliCommand = await detectAICLI()
  const prompt = buildMethodologyPrompt(fingerprint, qa, installedPackSkillIds, taskSkillIds)
  const raw = await invokeAICLI(cliCommand, prompt, 120_000, logger)
  const parsed = MethodologySkillsResponse.parse(JSON.parse(stripJsonFences(raw)))
  return parsed.skills
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fingerprint/methodology-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/fingerprint/methodology-builder.ts tests/fingerprint/methodology-builder.test.ts
git commit -m "feat: add methodology skills builder with AI invocation"
```

---

## Task 8: Update ClaudeCodeGenerator to emit pack skills

**Files:**
- Modify: `src/core/generators/claude-code.ts:93-169`
- Create: `tests/generators/claude-code-packs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/generators/claude-code-packs.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { ClaudeCodeGenerator } from '../../src/core/generators/claude-code.js'
import type { GeneratorInput } from '../../src/core/generators/base.js'
import { createFingerprint } from '../../src/core/fingerprint/types.js'
import { defaultProjectConfig, defaultGlobalConfig } from '../../src/core/config/types.js'
import type { SkullPackage } from '../../src/core/packages/types.js'

function makeInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    fingerprint: createFingerprint({ repoRoot: '/tmp/test', repoName: 'test' }),
    installedPackages: [],
    projectConfig: defaultProjectConfig(),
    globalConfig: defaultGlobalConfig(),
    ...overrides,
  }
}

function makePack(partial: Partial<SkullPackage>): SkullPackage {
  return {
    schemaVersion: '1.0.0',
    name: '@test/pkg',
    version: '1.0.0',
    description: 'Test',
    tags: [],
    appliesWhen: { frameworks: [], languages: [] },
    skills: [],
    rules: [],
    contextSections: {},
    dependencies: [],
    peerDependencies: [],
    ...partial,
  }
}

const gen = new ClaudeCodeGenerator()

describe('ClaudeCodeGenerator pack skill emission', () => {
  it('emits pack skills as .claude/skills/<pack>-<id>/SKILL.md', () => {
    const input = makeInput({
      installedPackages: [makePack({
        name: 'react-patterns',
        skills: [{
          id: 'add-component',
          name: 'add-component',
          description: 'Add a React component',
          content: '# Add Component\n\nContent here.',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: [],
        }],
      })],
    })
    const files = gen.generate(input)
    const packSkill = files.find((f) => f.relativePath.includes('react-patterns-add-component'))
    expect(packSkill).toBeDefined()
    expect(packSkill!.relativePath).toBe('.claude/skills/react-patterns-add-component/SKILL.md')
    expect(packSkill!.content).toContain('# Add Component')
  })

  it('does not emit extra skill files when no packs installed', () => {
    const input = makeInput()
    const files = gen.generate(input)
    const skillFiles = files.filter((f) => f.relativePath.startsWith('.claude/skills/') && f.relativePath.endsWith('/SKILL.md'))
    expect(skillFiles).toHaveLength(0)
  })

  it('filters pack skills by tool compatibility', () => {
    const input = makeInput({
      installedPackages: [makePack({
        name: 'cursor-only',
        skills: [{
          id: 'cursor-skill',
          name: 'cursor-skill',
          description: 'Cursor only',
          content: '# Cursor',
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: ['cursor'],
        }],
      })],
    })
    const files = gen.generate(input)
    const packSkill = files.find((f) => f.relativePath.includes('cursor-only-cursor-skill'))
    expect(packSkill).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/generators/claude-code-packs.test.ts`
Expected: FAIL — pack skills not emitted by current generator

- [ ] **Step 3: Update ClaudeCodeGenerator**

In `src/core/generators/claude-code.ts`, replace the installed package command emission (lines 143-147):

```typescript
    for (const pkg of installedPackages) {
      for (const skill of skillsForTool(pkg, this.toolId)) {
        files.push(repoFile(`.claude/commands/${skill.id}.md`, skill.content))
      }
    }
```

with pack skills in the new SKILL.md format (replaces the legacy `.claude/commands/` path for packs):

```typescript
    // Pack skills as SKILL.md (git-native packs use skills/ not commands/)
    for (const pkg of installedPackages) {
      for (const skill of skillsForTool(pkg, this.toolId)) {
        const packSkillContent = buildSkillFile({
          id: `${pkg.name}-${skill.id}`,
          title: skill.name,
          description: skill.description,
          content: skill.content,
          category: 'workflow',
        })
        files.push(repoFile(`.claude/skills/${pkg.name}-${skill.id}/SKILL.md`, packSkillContent))
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/generators/claude-code-packs.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full existing generator test suite to verify no regressions**

Run: `npx vitest run tests/generators/claude-code.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/generators/claude-code.ts tests/generators/claude-code-packs.test.ts
git commit -m "feat: emit pack skills as SKILL.md files in ClaudeCodeGenerator"
```

---

## Task 9: Wire methodology generation into init flow

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Add methodology import**

Add to imports in `src/cli/commands/init.ts`:

```typescript
import { generateMethodologySkills } from '../../core/fingerprint/methodology-builder.js'
import { loadInstalledPacks } from '../../core/packages/loader.js'
```

- [ ] **Step 2: Add methodology generation step after task skills**

After the existing task skills generation block (around line 281, after the sequential/parallel skills section), add:

```typescript
      // ── Step 5b: Generate methodology skills ────────────────────────────────

      const methCapture = { prompt: '', response: '' }
      const methLogger: VerboseLogger = {
        onPrompt:   (p) => { methCapture.prompt = p },
        onResponse: (r) => { methCapture.response = r },
      }
      const methSpin = spinner('Generating methodology skills…').start()
      try {
        const taskSkillIds = aiSkills.map((s) => s.id)
        const methodologySkills = await generateMethodologySkills(
          fingerprint, methLogger, qaArg, [], taskSkillIds,
        )
        aiSkills = [...aiSkills, ...methodologySkills]
        methSpin.succeed(`Generated ${methodologySkills.length} methodology skills`)
      } catch (err) {
        methSpin.warn('Could not generate methodology skills — skipping')
        log.info(err instanceof Error ? err.message : String(err))
      }
      if (options.verbose) {
        verboseBlock('Methodology prompt', methCapture.prompt)
        verboseBlock('Methodology response', methCapture.response)
      }
```

- [ ] **Step 3: Load installed packs before generator input**

Before the generator input construction (around line 294), add:

```typescript
      // ── Step 9: Load installed packs ──────────────────────────────────────
      const installedPacks = await loadInstalledPacks(repoRoot)
```

Then update the `generatorInput` to use `installedPacks`:

```typescript
      const generatorInput = {
        fingerprint,
        installedPackages: installedPacks,
        projectConfig,
        globalConfig,
        aiSkills,
        workflowConfig,
        userAnswers: Object.keys(qa).length > 0 ? qa : undefined,
      }
```

- [ ] **Step 4: Verify the full init flow compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: wire methodology generation and pack loading into init flow"
```

---

## Task 10: Wire methodology generation into sync flow

**Files:**
- Modify: `src/cli/commands/sync.ts`

- [ ] **Step 1: Add imports**

Add to imports in `src/cli/commands/sync.ts`:

```typescript
import { generateMethodologySkills } from '../../core/fingerprint/methodology-builder.js'
import { loadInstalledPacks } from '../../core/packages/loader.js'
```

- [ ] **Step 2: Add methodology generation to interactive mode**

After the existing task skills generation block (around line 154), add methodology generation following the same pattern as init.ts (non-fatal, with spinner and capture).

- [ ] **Step 3: Add methodology generation to hook mode**

After the existing task skills block in `hookMode` (around line 273), add:

```typescript
    // Methodology skills (non-fatal)
    try {
      const taskIds = aiSkills.map((s) => s.id)
      const methSkills = await generateMethodologySkills(fingerprint, undefined, undefined, [], taskIds)
      aiSkills = [...aiSkills, ...methSkills]
    } catch {
      // Skip silently in hook mode
    }
```

- [ ] **Step 4: Load installed packs in both modes**

In both `interactiveMode` and `hookMode`, before the generator input construction, add:

```typescript
    const installedPacks = await loadInstalledPacks(repoRoot)
```

Update `generatorInput.installedPackages` from `[]` to `installedPacks` in both locations.

- [ ] **Step 5: Note: `git pull` on installed packs is deferred to v1.1**

The spec describes pulling pack updates during sync. For v1, packs are static after install — users run `openskulls remove` + `openskulls add` to update. Add a `// TODO(v1.1): git pull on installed packs during sync` comment where `loadInstalledPacks` is called.

- [ ] **Step 6: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/sync.ts
git commit -m "feat: wire methodology skills and pack loading into sync flow"
```

---

## Task 11: Implement `openskulls add` command

**Files:**
- Create: `src/cli/commands/add.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Implement the add command**

Create `src/cli/commands/add.ts`:

```typescript
/**
 * openskulls add — install a skill pack from GitHub or a local path.
 *
 * Usage:
 *   openskulls add github:user/repo
 *   openskulls add github:user/repo#v1.2.0
 *   openskulls add ../local/path
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import type { Command } from 'commander'
import simpleGit from 'simple-git'
import { SkullPackManifest } from '../../core/packages/manifest.js'
import { loadInstalledPacks } from '../../core/packages/loader.js'
import { fatal, log, spinner } from '../ui/console.js'

interface ParsedSource {
  type: 'github' | 'local'
  url: string
  ref?: string
  repoUrl?: string
}

function parseSource(source: string): ParsedSource {
  if (source.startsWith('github:')) {
    const rest = source.slice('github:'.length)
    const [repo, ref] = rest.split('#')
    return {
      type: 'github',
      url: source,
      ref: ref || undefined,
      repoUrl: `https://github.com/${repo}.git`,
    }
  }
  return { type: 'local', url: source }
}

export function registerAdd(program: Command): void {
  program
    .command('add <source>')
    .description('Install a skill pack (github:user/repo or local path)')
    .action(async (source: string) => {
      const repoRoot = resolve('.')
      const parsed = parseSource(source)
      const packsDir = join(repoRoot, '.openskulls', 'packs')
      await mkdir(packsDir, { recursive: true })

      let packName: string | undefined
      let packDir: string | undefined

      try {
        if (parsed.type === 'github') {
          // Clone
          const spin = spinner(`Cloning ${source}…`).start()
          const tempName = parsed.url.split('/').pop()?.split('#')[0] ?? 'pack'
          packDir = join(packsDir, tempName)

          if (existsSync(packDir)) {
            spin.fail()
            fatal(`Pack '${tempName}' already installed. Use \`openskulls remove ${tempName}\` first.`)
          }

          const git = simpleGit()
          const cloneArgs = ['--depth', '1']
          if (parsed.ref) cloneArgs.push('--branch', parsed.ref)
          await git.clone(parsed.repoUrl!, packDir, cloneArgs)
          spin.succeed(`Cloned ${source}`)
        } else {
          // Local: symlink
          const localPath = resolve(parsed.url)
          if (!existsSync(localPath)) {
            fatal(`Local path not found: ${localPath}`)
          }
          const dirName = localPath.split('/').pop() ?? 'pack'
          packDir = join(packsDir, dirName)

          if (existsSync(packDir)) {
            fatal(`Pack '${dirName}' already installed. Use \`openskulls remove ${dirName}\` first.`)
          }

          await symlink(localPath, packDir)
          log.success(`Linked ${localPath}`)
        }

        // Validate manifest
        const manifestPath = join(packDir, 'skull-pack.toml')
        if (!existsSync(manifestPath)) {
          fatal('Not a valid skill pack — missing skull-pack.toml')
        }

        const raw = await readFile(manifestPath, 'utf-8')
        const manifest = SkullPackManifest.parse(tomlParse(raw))
        packName = manifest.name

        // Validate referenced files exist
        for (const s of manifest.skills) {
          if (!existsSync(join(packDir, s.path))) {
            fatal(`Missing skill file: ${s.path}`)
          }
        }
        for (const r of manifest.rules) {
          if (!existsSync(join(packDir, r.path))) {
            fatal(`Missing rule file: ${r.path}`)
          }
        }

        log.success(`Validated pack: ${manifest.name} (${manifest.skills.length} skills, ${manifest.rules.length} rules)`)

        // Update config.toml
        const configPath = join(repoRoot, '.openskulls', 'config.toml')
        let configData: Record<string, unknown> = {}
        if (existsSync(configPath)) {
          configData = tomlParse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
        }
        const packs = (configData['installed_packs'] as Array<Record<string, unknown>>) ?? []
        packs.push({
          name: manifest.name,
          source: parsed.type,
          source_url: parsed.url,
          installed_at: new Date().toISOString(),
        })
        configData['installed_packs'] = packs
        await mkdir(dirname(configPath), { recursive: true })
        await writeFile(configPath, tomlStringify(configData), 'utf-8')

        log.success(`Added ${manifest.name} to config.toml`)
        log.info('Run `openskulls sync` to regenerate context files with the new pack.')
      } catch (err) {
        // Clean up on failure
        if (packDir && existsSync(packDir)) {
          await rm(packDir, { recursive: true, force: true }).catch(() => {})
        }
        if ((err as { message?: string })?.message?.includes('fatal(')) throw err
        fatal(
          `Failed to install pack`,
          err instanceof Error ? err.message : String(err),
        )
      }
    })
}
```

- [ ] **Step 2: Register the command**

In `src/cli/index.ts`, add:

```typescript
import { registerAdd } from './commands/add.js'
```

And after `registerUninstall(program)`:

```typescript
  registerAdd(program)
```

- [ ] **Step 3: Add .openskulls/packs/ to .gitignore**

In the `registerAdd` action, after successfully installing a pack, check if `.gitignore` exists and whether it contains `.openskulls/packs/`. If not, append it:

```typescript
      // Ensure .openskulls/packs/ is gitignored
      const gitignorePath = join(repoRoot, '.gitignore')
      if (existsSync(gitignorePath)) {
        const content = await readFile(gitignorePath, 'utf-8')
        if (!content.includes('.openskulls/packs/')) {
          await writeFile(gitignorePath, content.trimEnd() + '\n.openskulls/packs/\n', 'utf-8')
          log.success('Added .openskulls/packs/ to .gitignore')
        }
      } else {
        await writeFile(gitignorePath, '.openskulls/packs/\n', 'utf-8')
        log.success('Created .gitignore with .openskulls/packs/')
      }
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/add.ts src/cli/index.ts
git commit -m "feat: add openskulls add command for git-native skill packs"
```

---

## Task 12: Implement `openskulls remove` command

**Files:**
- Create: `src/cli/commands/remove.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Implement the remove command**

Create `src/cli/commands/remove.ts`:

```typescript
/**
 * openskulls remove — uninstall a skill pack by name.
 */

import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import type { Command } from 'commander'
import { fatal, log } from '../ui/console.js'

export function registerRemove(program: Command): void {
  program
    .command('remove <name>')
    .description('Remove an installed skill pack')
    .action(async (name: string) => {
      const repoRoot = resolve('.')
      const packDir = join(repoRoot, '.openskulls', 'packs', name)

      // Remove pack directory
      if (existsSync(packDir)) {
        await rm(packDir, { recursive: true, force: true })
        log.success(`Removed .openskulls/packs/${name}`)
      } else {
        log.warn(`Pack directory not found: ${name} — removing config entry only`)
      }

      // Remove from config.toml
      const configPath = join(repoRoot, '.openskulls', 'config.toml')
      if (existsSync(configPath)) {
        try {
          const raw = await readFile(configPath, 'utf-8')
          const configData = tomlParse(raw) as Record<string, unknown>
          const packs = (configData['installed_packs'] as Array<Record<string, unknown>>) ?? []
          configData['installed_packs'] = packs.filter((p) => p['name'] !== name)
          await writeFile(configPath, tomlStringify(configData), 'utf-8')
          log.success(`Removed ${name} from config.toml`)
        } catch {
          log.warn('Could not update config.toml')
        }
      }

      log.info('Run `openskulls sync` to regenerate context files without this pack.')
    })
}
```

- [ ] **Step 2: Register the command**

In `src/cli/index.ts`, add:

```typescript
import { registerRemove } from './commands/remove.js'
```

And:

```typescript
  registerRemove(program)
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/remove.ts src/cli/index.ts
git commit -m "feat: add openskulls remove command"
```

---

## Task 13: Implement `openskulls list` command

**Files:**
- Create: `src/cli/commands/list.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Implement the list command**

Create `src/cli/commands/list.ts`:

```typescript
/**
 * openskulls list — show installed skill packs.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse as tomlParse } from 'smol-toml'
import type { Command } from 'commander'
import { loadInstalledPacks } from '../../core/packages/loader.js'
import { InstalledPackEntry } from '../../core/packages/types.js'
import { log, table } from '../ui/console.js'

export function registerList(program: Command): void {
  program
    .command('list')
    .description('Show installed skill packs')
    .action(async () => {
      const repoRoot = resolve('.')
      const packs = await loadInstalledPacks(repoRoot)

      if (packs.length === 0) {
        log.info('No skill packs installed.')
        log.info('Install one with: openskulls add github:user/repo')
        return
      }

      // Read config for source URLs
      const configPath = join(repoRoot, '.openskulls', 'config.toml')
      let sourceMap = new Map<string, string>()
      if (existsSync(configPath)) {
        try {
          const raw = await readFile(configPath, 'utf-8')
          const configData = tomlParse(raw) as Record<string, unknown>
          const rawEntries = (configData['installed_packs'] as unknown[]) ?? []
          for (const raw of rawEntries) {
            const parsed = InstalledPackEntry.safeParse({
              name: (raw as Record<string, unknown>)['name'],
              source: (raw as Record<string, unknown>)['source'],
              sourceUrl: (raw as Record<string, unknown>)['source_url'],
              installedAt: (raw as Record<string, unknown>)['installed_at'],
            })
            if (parsed.success) {
              sourceMap.set(parsed.data.name, parsed.data.sourceUrl)
            }
          }
        } catch {
          // Use pack names only
        }
      }

      table(packs.map((p) => [
        p.name,
        sourceMap.get(p.name) ?? '—',
        `${p.skills.length} skills`,
        `${p.rules.length} rules`,
      ]))
    })
}
```

- [ ] **Step 2: Register the command**

In `src/cli/index.ts`, add:

```typescript
import { registerList } from './commands/list.js'
```

And:

```typescript
  registerList(program)
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/list.ts src/cli/index.ts
git commit -m "feat: add openskulls list command"
```

---

## Task 14: Run full test suite and fix regressions

**Files:**
- All test files

- [ ] **Step 1: Run the complete test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run the linter**

Run: `npx eslint src/ tests/`
Expected: No lint errors

- [ ] **Step 4: Fix any issues found**

Address each failure individually, maintaining existing test patterns.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve regressions from platform play implementation"
```

---

## Task 15: Update CLAUDE.md Key Files table

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new files to the Key Files table**

Add these rows to the Key Files table in `CLAUDE.md`:

| Path | Purpose |
|---|---|
| `src/core/packages/manifest.ts` | `SkullPackManifest` Zod schema for pack TOML format |
| `src/core/packages/loader.ts` | `loadInstalledPacks()`, pack-to-SkullPackage transformation |
| `src/core/fingerprint/methodology-builder.ts` | `generateMethodologySkills()`, `MethodologySkillsResponse` schema |
| `src/core/fingerprint/methodology-prompt.ts` | `buildMethodologyPrompt()` — pure, builds methodology AI prompt |
| `src/cli/commands/add.ts` | `registerAdd()` — `openskulls add` command |
| `src/cli/commands/remove.ts` | `registerRemove()` — `openskulls remove` command |
| `src/cli/commands/list.ts` | `registerList()` — `openskulls list` command |
| `templates/prompts/methodology.md.hbs` | Methodology skills prompt template |

- [ ] **Step 2: Update MVP Status table**

Update relevant rows and add new ones.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with platform play files and status"
```

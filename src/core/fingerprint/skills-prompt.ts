/**
 * buildSkillsPrompt — constructs the AI skills generation prompt.
 *
 * The prompt template lives at templates/prompts/skills.md.hbs and can be
 * edited directly to tune skill quality and structure without touching TypeScript.
 *
 * This function assembles the dynamic project summary from the fingerprint
 * and injects it into the template. It reads the template once at module
 * load and remains a pure function at call time.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import type { RepoFingerprint } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../../templates/prompts/skills.md.hbs')
const TEMPLATE_SOURCE = readFileSync(TEMPLATE_PATH, 'utf-8')
const COMPILED = Handlebars.compile(TEMPLATE_SOURCE, { noEscape: true })

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

  return COMPILED({ projectSummary: parts.join('\n') })
}

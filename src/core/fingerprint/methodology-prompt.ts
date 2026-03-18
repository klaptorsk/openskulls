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

/**
 * buildAnalysisPrompt — constructs the AI analysis prompt.
 *
 * The prompt template lives at templates/prompts/analysis.md.hbs and can be
 * edited directly to tune analysis quality without touching TypeScript.
 *
 * This function handles only the dynamic parts (file tree, config contents)
 * and injects them into the template. It reads the template once at module
 * load and remains a pure function at call time.
 */

import Handlebars from 'handlebars'
import { ANALYSIS_TEMPLATE } from '../../generated/templates.js'

const COMPILED = Handlebars.compile(ANALYSIS_TEMPLATE, { noEscape: true })

const MAX_TREE_ENTRIES = 500

export function buildAnalysisPrompt(
  repoName: string,
  fileTree: readonly string[],
  configContents: ReadonlyMap<string, string>,
): string {
  const treeLines =
    fileTree.length > MAX_TREE_ENTRIES
      ? [
          ...fileTree.slice(0, MAX_TREE_ENTRIES),
          `... (${fileTree.length - MAX_TREE_ENTRIES} more files not shown)`,
        ]
      : [...fileTree]

  const configSection = [...configContents.entries()]
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join('\n\n')

  return COMPILED({
    repoName,
    fileCount: fileTree.length,
    fileTree: treeLines.join('\n'),
    configSection: configSection || '(no config files found)',
  })
}

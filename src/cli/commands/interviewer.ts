/**
 * Workflow setup interviewer.
 *
 * Asks two quick questions after repo analysis to configure how Claude
 * should handle documentation updates and commits in this repo.
 * Answers are saved to .openskulls/config.toml as [workflow].
 */

import { createInterface } from 'node:readline/promises'
import type { WorkflowConfig } from '../../core/config/types.js'
import { divider, heading, log } from '../ui/console.js'

export async function runInterviewer(
  opts: { yes?: boolean } = {},
): Promise<WorkflowConfig> {
  if (opts.yes) return { autoDocs: 'ask', autoCommit: 'ask' }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  log.blank()
  divider()
  heading('Workflow setup')
  log.info('Two quick questions to configure how Claude works in this repo.')
  log.blank()

  // Question 1 — auto-docs
  console.log('  Auto-documentation — when a feature is added or updated:')
  console.log('    1  Update docs automatically')
  console.log('    2  Ask me first  ← default')
  console.log("    3  I'll handle docs myself")
  const docsAnswer = (await rl.question('\n  → [1/2/3]  ')).trim()
  const autoDocs: WorkflowConfig['autoDocs'] =
    docsAnswer === '1' ? 'always' : docsAnswer === '3' ? 'never' : 'ask'

  log.blank()

  // Question 2 — auto-commit
  console.log('  Auto-commit — when a task is complete:')
  console.log('    1  Ask me first  ← default')
  console.log('    2  Commit automatically')
  console.log("    3  Never — I'll commit manually")
  const commitAnswer = (await rl.question('\n  → [1/2/3]  ')).trim()
  const autoCommit: WorkflowConfig['autoCommit'] =
    commitAnswer === '2' ? 'always' : commitAnswer === '3' ? 'never' : 'ask'

  rl.close()
  divider()

  return { autoDocs, autoCommit }
}

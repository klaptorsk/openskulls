/**
 * Workflow setup interviewer.
 *
 * Asks quick questions after repo analysis to configure how Claude
 * should handle documentation updates, commits, architect reviews,
 * and skill generation in this repo.
 * Answers are saved to .openskulls/config.toml as [workflow].
 */

import { createInterface } from 'node:readline/promises'
import type { WorkflowConfig } from '../../core/config/types.js'
import { divider, heading, log } from '../ui/console.js'

export async function runInterviewer(
  opts: { yes?: boolean } = {},
): Promise<WorkflowConfig> {
  if (opts.yes) {
    return {
      autoDocs: 'ask',
      autoCommit: 'ask',
      architectEnabled: false,
      architectDomain: '',
      architectReview: 'ask',
      useSubagents: false,
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  log.blank()
  divider()
  heading('Workflow setup')
  log.info('A few quick questions to configure how Claude works in this repo.')
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

  log.blank()

  // Question 3 — architect agent
  console.log('  Architect agent — generate a domain expert for this project:')
  console.log('    1  Yes, include an architect agent  ← default')
  console.log('    2  No, skip')
  const archAnswer = (await rl.question('\n  → [1/2]  ')).trim()
  const architectEnabled = archAnswer !== '2'

  let architectDomain = ''
  let architectReview: WorkflowConfig['architectReview'] = 'ask'

  if (architectEnabled) {
    log.blank()

    // Question 4 — architect domain
    console.log('  What is the primary domain or focus for the architect?')
    console.log('  (Leave blank to auto-detect from project signals)')
    architectDomain = (await rl.question('\n  → ')).trim()

    log.blank()

    // Question 5 — architect review trigger
    console.log('  When should the architect review new features:')
    console.log('    1  Ask me first  ← default')
    console.log('    2  Always (add to workflow rules automatically)')
    console.log('    3  Only when I invoke /architect-review')
    const reviewAnswer = (await rl.question('\n  → [1/2/3]  ')).trim()
    architectReview = reviewAnswer === '2' ? 'always' : reviewAnswer === '3' ? 'never' : 'ask'

    log.blank()
  }

  // Question 6 — subagent generation
  console.log('  Skill generation — how to generate project skills:')
  console.log('    1  Single AI call  ← default')
  console.log('    2  Parallel subagents (faster, uses more AI calls)')
  const subagentAnswer = (await rl.question('\n  → [1/2]  ')).trim()
  const useSubagents = subagentAnswer === '2'

  rl.close()
  divider()

  return { autoDocs, autoCommit, architectEnabled, architectDomain, architectReview, useSubagents }
}

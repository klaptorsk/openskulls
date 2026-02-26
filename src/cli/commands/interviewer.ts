/**
 * Workflow setup interviewer.
 *
 * Two-part setup flow:
 *  Part A — Static workflow questions (always asked, no AI required):
 *            auto-docs, auto-commit, architect on/off.
 *  Part B — Dynamic AI questions (repo-specific, generated from fingerprint):
 *            Rendered from AIQuestion[] returned by generateQuestionnaire().
 *            Skipped silently if aiQuestions is empty.
 *
 * Returns a UserContext combining WorkflowConfig + qa answer map.
 * Answers are saved to .openskulls/config.toml as [workflow] and [workflow.answers].
 */

import { createInterface } from 'node:readline/promises'
import type { AIQuestion } from '../../core/fingerprint/questionnaire-builder.js'
import type { UserContext, WorkflowConfig } from '../../core/config/types.js'
import { divider, heading, log, subheading } from '../ui/console.js'

export async function runInterviewer(
  opts: { yes?: boolean } = {},
  aiQuestions: AIQuestion[] = [],
): Promise<UserContext> {
  if (opts.yes) {
    return {
      workflowConfig: {
        autoDocs: 'ask',
        autoCommit: 'ask',
        architectEnabled: false,
        architectDomain: '',
        architectReview: 'ask',
        useSubagents: false,
      },
      qa: {},
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  log.blank()
  divider()
  heading('Workflow setup')
  log.info('A few quick questions to configure how Claude works in this repo.')
  log.blank()

  // ── Part A: Static workflow questions ─────────────────────────────────────

  subheading('Workflow preferences')
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

  const workflowConfig: WorkflowConfig = {
    autoDocs, autoCommit, architectEnabled, architectDomain, architectReview, useSubagents,
  }

  // ── Part B: Dynamic AI questions ──────────────────────────────────────────

  const qa: Record<string, string> = {}

  if (aiQuestions.length > 0) {
    log.blank()
    subheading('Project-specific setup')
    log.info('Based on what was detected in this repo:')
    log.blank()

    for (const question of aiQuestions) {
      console.log(`  ${question.text}`)
      console.log(`  (${question.context})`)
      log.blank()

      let answer: string

      if (question.type === 'yesno') {
        const defaultHint = question.default === 'yes' ? ' ← default' : ''
        const altHint = question.default === 'no' ? ' ← default' : ''
        console.log(`    y  Yes${question.default === 'yes' ? defaultHint : ''}`)
        console.log(`    n  No${question.default === 'no' ? altHint : ''}`)
        const raw = (await rl.question('\n  → [y/n]  ')).trim().toLowerCase()
        if (raw === 'y' || raw === 'yes') {
          answer = 'yes'
        } else if (raw === 'n' || raw === 'no') {
          answer = 'no'
        } else {
          answer = question.default ?? 'yes'
        }
      } else if (question.type === 'choice' && question.choices) {
        question.choices.forEach((choice, i) => {
          const isDefault = choice === question.default
          console.log(`    ${i + 1}  ${choice}${isDefault ? '  ← default' : ''}`)
        })
        const raw = (await rl.question(`\n  → [1-${question.choices.length}]  `)).trim()
        const idx = parseInt(raw, 10) - 1
        answer = (idx >= 0 && idx < question.choices.length)
          ? question.choices[idx]!
          : (question.default ?? question.choices[0]!)
      } else {
        // text
        const defaultHint = question.default ? ` (default: ${question.default})` : ''
        const raw = (await rl.question(`  → ${defaultHint}  `)).trim()
        answer = raw || question.default || ''
      }

      qa[question.id] = answer
      log.blank()
    }
  }

  rl.close()
  divider()

  return { workflowConfig, qa }
}

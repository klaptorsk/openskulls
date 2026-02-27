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

import { select, text, confirm, isCancel, cancel } from '@clack/prompts'
import type { AIQuestion } from '../../core/fingerprint/questionnaire-builder.js'
import type { UserContext, WorkflowConfig } from '../../core/config/types.js'
import { divider, subheading } from '../ui/console.js'

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

  // ── Part A: Static workflow questions ─────────────────────────────────────

  subheading('Workflow preferences')

  // Question 1 — auto-docs
  const autoDocs = await select({
    message: 'Auto-documentation — when a feature is added or updated:',
    options: [
      { value: 'ask' as const,    label: 'Ask me first',              hint: 'default' },
      { value: 'always' as const, label: 'Update docs automatically' },
      { value: 'never' as const,  label: "I'll handle docs myself" },
    ],
  })
  if (isCancel(autoDocs)) { cancel('Cancelled.'); process.exit(0) }

  // Question 2 — auto-commit
  const autoCommit = await select({
    message: 'Auto-commit — when a task is complete:',
    options: [
      { value: 'ask' as const,    label: 'Ask me first',            hint: 'default' },
      { value: 'always' as const, label: 'Commit automatically' },
      { value: 'never' as const,  label: "Never — I'll commit manually" },
    ],
  })
  if (isCancel(autoCommit)) { cancel('Cancelled.'); process.exit(0) }

  // Question 3 — architect agent
  const archAnswer = await select({
    message: 'Architect agent — generate a domain expert for this project:',
    options: [
      { value: 'yes', label: 'Yes, include an architect agent', hint: 'default' },
      { value: 'no',  label: 'No, skip' },
    ],
  })
  if (isCancel(archAnswer)) { cancel('Cancelled.'); process.exit(0) }

  const architectEnabled = archAnswer === 'yes'

  let architectDomain = ''
  let architectReview: WorkflowConfig['architectReview'] = 'ask'

  if (architectEnabled) {
    // Question 4 — architect domain
    const domainAnswer = await text({
      message: 'Primary domain or focus for the architect:',
      placeholder: 'auto-detect from project signals',
    })
    if (isCancel(domainAnswer)) { cancel('Cancelled.'); process.exit(0) }
    architectDomain = domainAnswer ?? ''

    // Question 5 — architect review trigger
    const reviewAnswer = await select({
      message: 'When should the architect review new features:',
      options: [
        { value: 'ask' as const,    label: 'Ask me first',                                  hint: 'default' },
        { value: 'always' as const, label: 'Always (add to workflow rules automatically)' },
        { value: 'never' as const,  label: 'Only when I invoke /architect-review' },
      ],
    })
    if (isCancel(reviewAnswer)) { cancel('Cancelled.'); process.exit(0) }
    architectReview = reviewAnswer
  }

  // Question 6 — subagent generation
  const subagentAnswer = await select({
    message: 'Skill generation — how to generate project skills:',
    options: [
      { value: 'single',   label: 'Single AI call',                           hint: 'default' },
      { value: 'parallel', label: 'Parallel subagents (faster, uses more AI calls)' },
    ],
  })
  if (isCancel(subagentAnswer)) { cancel('Cancelled.'); process.exit(0) }
  const useSubagents = subagentAnswer === 'parallel'

  const workflowConfig: WorkflowConfig = {
    autoDocs, autoCommit, architectEnabled, architectDomain, architectReview, useSubagents,
  }

  // ── Part B: Dynamic AI questions ──────────────────────────────────────────

  const qa: Record<string, string> = {}

  if (aiQuestions.length > 0) {
    subheading('Project-specific setup')

    for (const question of aiQuestions) {
      let answer: string

      if (question.type === 'yesno') {
        const result = await confirm({
          message: `${question.text}\n  ${question.context}`,
          initialValue: question.default !== 'no',
        })
        if (isCancel(result)) { cancel('Cancelled.'); process.exit(0) }
        answer = result ? 'yes' : 'no'
      } else if (question.type === 'choice' && question.choices) {
        const result = await select({
          message: `${question.text}\n  ${question.context}`,
          options: question.choices.map((c) => ({
            value: c,
            label: c,
            hint: c === question.default ? 'default' : undefined,
          })),
        })
        if (isCancel(result)) { cancel('Cancelled.'); process.exit(0) }
        answer = result as string
      } else {
        // text
        const result = await text({
          message: `${question.text}\n  ${question.context}`,
          placeholder: question.default ?? '',
          defaultValue: question.default ?? '',
        })
        if (isCancel(result)) { cancel('Cancelled.'); process.exit(0) }
        answer = result ?? question.default ?? ''
      }

      qa[question.id] = answer
    }
  }

  divider()

  return { workflowConfig, qa }
}

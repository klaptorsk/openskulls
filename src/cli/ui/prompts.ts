/**
 * Custom prompt wrappers built on @clack/core.
 *
 * circleMultiselect — multiselect that uses ●/○ circle bullets (matching the
 * style of @clack/prompts select()) instead of the default ◼/◻ squares.
 */

import { MultiSelectPrompt } from '@clack/core'
import {
  S_BAR,
  S_BAR_END,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  symbol as stateSymbol,
  limitOptions,
} from '@clack/prompts'
import chalk from 'chalk'

interface CircleOption {
  value: string
  label?: string
  hint?:  string
}

function renderItem(
  opt:        CircleOption,
  isFocused:  boolean,
  selVals:    string[],
): string {
  const label = opt.label ?? String(opt.value)
  const hint  = opt.hint && isFocused ? chalk.dim(` (${opt.hint})`) : ''
  const sel   = selVals.includes(opt.value)

  if (isFocused && sel) return `${chalk.green(S_RADIO_ACTIVE)}  ${label}${hint}`
  if (sel)              return `${chalk.green(S_RADIO_ACTIVE)}  ${chalk.dim(label)}`
  if (isFocused)        return `${chalk.cyan(S_RADIO_INACTIVE)}  ${label}${hint}`
  return                       `${chalk.dim(S_RADIO_INACTIVE)}  ${chalk.dim(label)}`
}

/**
 * Multiselect prompt that renders ●/○ instead of ◼/◻, matching @clack/prompts
 * select() visually. Space to toggle, Enter to confirm.
 */
export async function circleMultiselect(opts: {
  message:       string
  options:       CircleOption[]
  initialValues?: string[]
  required?:     boolean
}): Promise<string[] | symbol> {
  const raw = await new MultiSelectPrompt<CircleOption>({
    options:       opts.options,
    initialValues: opts.initialValues,
    required:      opts.required ?? false,

    render() {
      const selVals = (this.value ?? []) as string[]
      const state   = this.state
      const barCol  = state === 'error' ? chalk.yellow : chalk.cyan
      const cBar    = `${barCol(S_BAR)}  `

      switch (state) {
        case 'submit': {
          const labels = opts.options
            .filter(o => selVals.includes(o.value))
            .map(o => o.label ?? o.value)
            .join(chalk.dim(', ')) || chalk.dim('none')
          return `${stateSymbol(state)}  ${chalk.dim(labels)}`
        }
        case 'cancel':
          return `${stateSymbol(state)}  ${chalk.dim('Cancelled')}`
        default: {
          const header = `${stateSymbol(state)}  ${opts.message}`
          const footer = [
            `${cBar}${chalk.dim('↑/↓')} navigate  ${chalk.dim('space')} toggle  ${chalk.dim('enter')} confirm`,
            `${barCol(S_BAR_END)}`,
          ]
          const cursor = this.cursor
          const items  = limitOptions({
            cursor,
            options:       opts.options,
            maxItems:      undefined,
            style:         (o, active) => renderItem(o as CircleOption, active, selVals),
            rowPadding:    1 + footer.length,
            columnPadding: 0,
          })
          return [header, ...items.map(i => `${cBar}${i}`), ...footer].join('\n')
        }
      }
    },
  }).prompt()
  return raw ?? []
}

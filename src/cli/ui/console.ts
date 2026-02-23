/**
 * Terminal output utilities.
 *
 * Consistent, styled output across all CLI commands.
 * Wraps chalk for colours and ora for spinners.
 */

import chalk from 'chalk'
import ora, { type Ora } from 'ora'

// ─── Basic output ─────────────────────────────────────────────────────────────

export const log = {
  success: (text: string) => console.log(`${chalk.green('✓')} ${text}`),
  warn:    (text: string) => console.log(`${chalk.yellow('⚠')} ${text}`),
  error:   (text: string) => console.error(`${chalk.red('✗')} ${text}`),
  info:    (text: string) => console.log(`${chalk.dim('·')} ${text}`),
  blank:   ()             => console.log(),
}

// ─── Headings ─────────────────────────────────────────────────────────────────

export function heading(text: string): void {
  console.log(`\n${chalk.bold(text)}`)
}

export function subheading(text: string): void {
  console.log(chalk.dim(text))
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function panel(title: string, lines: string[], borderColor = chalk.blue): void {
  const width = Math.max(title.length + 4, ...lines.map((l) => l.length + 4), 50)
  const top    = `╭${'─'.repeat(width)}╮`
  const bottom = `╰${'─'.repeat(width)}╯`
  const titleLine = `│ ${borderColor.bold(title)}${' '.repeat(width - title.length - 1)}│`
  const divider = `├${'─'.repeat(width)}┤`

  console.log(top)
  console.log(titleLine)
  if (lines.length > 0) {
    console.log(divider)
    for (const line of lines) {
      console.log(`│ ${line}${' '.repeat(Math.max(0, width - line.length - 1))}│`)
    }
  }
  console.log(bottom)
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function table(rows: Array<[string, string]>, labelWidth = 20): void {
  for (const [label, value] of rows) {
    console.log(`  ${chalk.dim(label.padEnd(labelWidth))} ${value}`)
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function spinner(text: string): Ora {
  return ora({ text, color: 'blue' })
}

// ─── Diff preview ─────────────────────────────────────────────────────────────

export function fileList(
  files: Array<{ path: string; action: 'create' | 'update' | 'skip' }>,
): void {
  for (const f of files) {
    const icon =
      f.action === 'create' ? chalk.green('+') :
      f.action === 'update' ? chalk.yellow('~') :
      chalk.dim('·')
    console.log(`  ${icon} ${f.path}`)
  }
}

// ─── Section separator ────────────────────────────────────────────────────────

export function divider(width = 60): void {
  console.log(chalk.dim('─'.repeat(width)))
}

// ─── Error handling ───────────────────────────────────────────────────────────

export function fatal(message: string, hint?: string): never {
  log.error(message)
  if (hint) log.info(hint)
  process.exit(1)
}

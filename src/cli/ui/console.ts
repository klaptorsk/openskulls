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
  const top       = `╭${'─'.repeat(width)}╮`
  const bottom    = `╰${'─'.repeat(width)}╯`
  const titleLine = `│ ${borderColor.bold(title)}${' '.repeat(width - title.length - 1)}│`
  const divLine   = `├${'─'.repeat(width)}┤`

  console.log(top)
  console.log(titleLine)
  if (lines.length > 0) {
    console.log(divLine)
    for (const line of lines) {
      console.log(`│ ${line}${' '.repeat(Math.max(0, width - line.length - 1))}│`)
    }
  }
  console.log(bottom)
}

// ─── Table ────────────────────────────────────────────────────────────────────
//
// Multi-column table with automatic per-column width alignment.
// First column is rendered dim (label style).
// Empty string cells render as a dim dash so columns stay visually aligned.
// ANSI escape codes are stripped when measuring visible widths.

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, '')
}

function padCol(s: string, width: number): string {
  const visible = stripAnsi(s).length
  return s + ' '.repeat(Math.max(0, width - visible))
}

export function table(rows: string[][]): void {
  if (rows.length === 0) return

  const colCount = Math.max(...rows.map((r) => r.length))

  // Measure column widths from visible characters only
  const widths = Array.from({ length: colCount }, (_, c) =>
    Math.max(...rows.map((r) => stripAnsi(r[c] ?? '').length)),
  )

  for (const row of rows) {
    const cells = row.map((cell, c) => {
      const styled =
        cell === '' ? chalk.dim('—') :
        c === 0     ? chalk.dim(cell) :
        cell
      // Pad every column except the last to keep columns aligned
      return c < row.length - 1 ? padCol(styled, widths[c] ?? 0) : styled
    })
    console.log('  ' + cells.join('  '))
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function spinner(text: string): Ora {
  return ora({ text, color: 'blue' })
}

// ─── Banner ───────────────────────────────────────────────────────────────────

const OPENSKULLS_ASCII = [
  ' ███  ████  █████ █   █  ████ █   █ █   █ █     █      ████',
  '█   █ █   █ █     ██  █ █     █  █  █   █ █     █     █    ',
  '█   █ ████  ████  █ █ █  ███  ████  █   █ █     █      ███ ',
  '█   █ █     █     █  ██     █ █  █  █   █ █     █         █',
  ' ███  █     █████ █   █ ████  █   █  ███  █████ █████ ████ ',
]

const BANNER_WIDTH = 59

export function banner(command: string, subtitle: string): void {
  console.log()
  for (const line of OPENSKULLS_ASCII) {
    console.log(chalk.red(line))
  }
  console.log(chalk.dim('─'.repeat(BANNER_WIDTH)))
  console.log(`  ${chalk.bold(command)}  ${chalk.dim('▸')}  ${chalk.dim(subtitle)}`)
  console.log()
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

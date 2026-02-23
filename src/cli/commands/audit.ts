/**
 * openskulls audit — detect drift between code and AI context.
 */

import type { Command } from 'commander'
import { log } from '../ui/console.js'

export function registerAudit(program: Command): void {
  program
    .command('audit [path]')
    .description('Check how well the AI context reflects the current codebase')
    .option('--ci', 'Exit non-zero if any error-severity findings exist')
    .option('--fail-on <severity>', 'Minimum severity to fail on in CI mode', 'error')
    .action(async (_path: string = '.', _options: { ci?: boolean; failOn?: string }) => {
      log.warn('audit is not yet implemented — coming in Step 7.')
    })
}

/**
 * openskulls sync — update context after code changes.
 */

import type { Command } from 'commander'
import { log } from '../ui/console.js'

export function registerSync(program: Command): void {
  program
    .command('sync [path]')
    .description('Update AI context files after code changes')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--hook', 'Running from a git hook — suppress interactive output', false)
    .option('--changed <files>', 'Newline-separated changed files (from hook)')
    .action(async (_path: string = '.', options: { hook?: boolean }) => {
      if (!options.hook) {
        log.warn('sync is not yet implemented — coming in Step 6.')
      }
    })
}

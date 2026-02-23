/**
 * openskulls init — first-time setup for a repository.
 */

import { resolve } from 'node:path'
import type { Command } from 'commander'
import { log, panel, spinner } from '../ui/console.js'

export function registerInit(program: Command): void {
  program
    .command('init [path]')
    .description('Analyse a repository and generate AI context files')
    .option('-n, --dry-run', 'Show what would be generated without writing files')
    .option('-t, --target <tools...>', 'AI tool(s) to generate for (e.g. claude_code, cursor)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (path: string = '.', options: { dryRun?: boolean; target?: string[]; yes?: boolean }) => {
      const repoRoot = resolve(path)

      panel('OpenSkulls', [`Initialising AI context for`, repoRoot])

      // TODO Step 2: Run FingerprintCollector
      // TODO Step 3: Run ClaudeCodeGenerator
      // TODO Step 5: Run Interviewer
      // TODO Step 6: Install git hooks
      log.warn('init is not yet implemented — coming in the next build step.')
    })
}

/**
 * openskulls add — install a skill/rule package.
 */

import type { Command } from 'commander'
import { log } from '../ui/console.js'

export function registerAdd(program: Command): void {
  program
    .command('add <package>')
    .description('Install a skill and rule package into this repository')
    .addHelpText(
      'after',
      `
Examples:
  $ openskulls add @openskulls/react
  $ openskulls add @openskulls/fastapi@2.0.0
  $ openskulls add ./my-company-rules`,
    )
    .action(async (pkg: string) => {
      // TODO Step 8: local loader + registry client + lockfile update
      log.warn(`Package install coming in Step 8. (requested: ${pkg})`)
    })
}

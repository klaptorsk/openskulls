/**
 * CLI program setup — command routing only, no business logic.
 */

import { Command } from 'commander'
import { registerAdd } from './commands/add.js'
import { registerAudit } from './commands/audit.js'
import { registerInit } from './commands/init.js'
import { registerPublish } from './commands/publish.js'
import { registerSync } from './commands/sync.js'
import { registerUninstall } from './commands/uninstall.js'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('openskulls')
    .description(
      'Makes your repo readable to AI agents, then keeps it readable as the code evolves.',
    )
    .version('0.1.0', '-v, --version')
    .helpOption('-h, --help', 'Show help')

  registerInit(program)
  registerSync(program)
  registerAudit(program)
  registerAdd(program)
  registerPublish(program)
  registerUninstall(program)

  return program
}

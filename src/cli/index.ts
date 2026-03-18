/**
 * CLI program setup — command routing only, no business logic.
 */

import { createRequire } from 'module'
import { Command } from 'commander'
import { registerInit } from './commands/init.js'
import { registerSync } from './commands/sync.js'
import { registerUninstall } from './commands/uninstall.js'
import { registerAdd } from './commands/add.js'
import { registerRemove } from './commands/remove.js'
import { registerList } from './commands/list.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

export function createProgram(): Command {
  const program = new Command()

  program
    .name('openskulls')
    .description(
      'Makes your repo readable to AI agents, then keeps it readable as the code evolves.',
    )
    .version(version, '-v, --version')
    .helpOption('-h, --help', 'Show help')

  registerInit(program)
  registerSync(program)
  registerUninstall(program)
  registerAdd(program)
  registerRemove(program)
  registerList(program)

  return program
}

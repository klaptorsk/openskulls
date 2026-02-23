/**
 * openskulls publish — publish a package to the registry.
 */

import type { Command } from 'commander'
import { log } from '../ui/console.js'

export function registerPublish(program: Command): void {
  program
    .command('publish')
    .description('Package and publish skills/rules to the OpenSkulls registry')
    .option('--registry <url>', 'Registry URL', 'https://registry.openskulls.dev')
    .action(async () => {
      log.warn('publish is coming in v0.3.')
    })
}

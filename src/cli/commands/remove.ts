/**
 * openskulls remove — uninstall a skill pack by name.
 */

import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import type { Command } from 'commander'
import { fatal, log } from '../ui/console.js'

export function registerRemove(program: Command): void {
  program
    .command('remove <name>')
    .description('Remove an installed skill pack')
    .action(async (name: string) => {
      const repoRoot = resolve('.')
      const packDir = join(repoRoot, '.openskulls', 'packs', name)

      // Remove pack directory
      if (existsSync(packDir)) {
        await rm(packDir, { recursive: true, force: true })
        log.success(`Removed .openskulls/packs/${name}`)
      } else {
        log.warn(`Pack directory not found: ${name} — removing config entry only`)
      }

      // Remove from config.toml
      const configPath = join(repoRoot, '.openskulls', 'config.toml')
      if (existsSync(configPath)) {
        try {
          const raw = await readFile(configPath, 'utf-8')
          const configData = tomlParse(raw) as Record<string, unknown>
          const packs = (configData['installed_packs'] as Array<Record<string, unknown>>) ?? []
          configData['installed_packs'] = packs.filter((p) => p['name'] !== name)
          await writeFile(configPath, tomlStringify(configData), 'utf-8')
          log.success(`Removed ${name} from config.toml`)
        } catch {
          log.warn('Could not update config.toml')
        }
      }

      log.info('Run `openskulls sync` to regenerate context files without this pack.')
    })
}

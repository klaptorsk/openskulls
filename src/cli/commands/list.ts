/**
 * openskulls list — show installed skill packs.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse as tomlParse } from 'smol-toml'
import type { Command } from 'commander'
import { loadInstalledPacks } from '../../core/packages/loader.js'
import { InstalledPackEntry } from '../../core/packages/types.js'
import { log, table } from '../ui/console.js'

export function registerList(program: Command): void {
  program
    .command('list')
    .description('Show installed skill packs')
    .action(async () => {
      const repoRoot = resolve('.')
      const packs = await loadInstalledPacks(repoRoot)

      if (packs.length === 0) {
        log.info('No skill packs installed.')
        log.info('Install one with: openskulls add github:user/repo')
        return
      }

      // Read config for source URLs
      const configPath = join(repoRoot, '.openskulls', 'config.toml')
      const sourceMap = new Map<string, string>()
      if (existsSync(configPath)) {
        try {
          const raw = await readFile(configPath, 'utf-8')
          const configData = tomlParse(raw) as Record<string, unknown>
          const rawEntries = (configData['installed_packs'] as unknown[]) ?? []
          for (const entry of rawEntries) {
            const parsed = InstalledPackEntry.safeParse({
              name: (entry as Record<string, unknown>)['name'],
              source: (entry as Record<string, unknown>)['source'],
              sourceUrl: (entry as Record<string, unknown>)['source_url'],
              installedAt: (entry as Record<string, unknown>)['installed_at'],
            })
            if (parsed.success) {
              sourceMap.set(parsed.data.name, parsed.data.sourceUrl)
            }
          }
        } catch {
          // Use pack names only
        }
      }

      table(packs.map((p) => [
        p.name,
        sourceMap.get(p.name) ?? '—',
        `${p.skills.length} skills`,
        `${p.rules.length} rules`,
      ]))
    })
}

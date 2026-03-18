/**
 * openskulls add — install a skill pack from GitHub or a local path.
 *
 * Usage:
 *   openskulls add github:user/repo
 *   openskulls add github:user/repo#v1.2.0
 *   openskulls add ../local/path
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import type { Command } from 'commander'
import { simpleGit } from 'simple-git'
import { SkullPackManifest } from '../../core/packages/manifest.js'
import { fatal, log, spinner } from '../ui/console.js'

interface ParsedSource {
  type: 'github' | 'local'
  url: string
  ref?: string
  repoUrl?: string
}

function parseSource(source: string): ParsedSource {
  if (source.startsWith('github:')) {
    const rest = source.slice('github:'.length)
    const [repo, ref] = rest.split('#')
    return {
      type: 'github',
      url: source,
      ref: ref || undefined,
      repoUrl: `https://github.com/${repo}.git`,
    }
  }
  return { type: 'local', url: source }
}

export function registerAdd(program: Command): void {
  program
    .command('add <source>')
    .description('Install a skill pack (github:user/repo or local path)')
    .addHelpText('after', `
Examples:
  $ openskulls add github:user/react-patterns
  $ openskulls add github:user/react-patterns#v1.0.0
  $ openskulls add ../local/my-pack`)
    .action(async (source: string) => {
      const repoRoot = resolve('.')
      const parsed = parseSource(source)
      const packsDir = join(repoRoot, '.openskulls', 'packs')
      await mkdir(packsDir, { recursive: true })

      let packDir: string | undefined

      try {
        if (parsed.type === 'github') {
          const spin = spinner(`Cloning ${source}…`).start()
          const tempName = parsed.url.split('/').pop()?.split('#')[0] ?? 'pack'
          packDir = join(packsDir, tempName)

          if (existsSync(packDir)) {
            spin.fail()
            fatal(`Pack '${tempName}' already installed. Use \`openskulls remove ${tempName}\` first.`)
          }

          const git = simpleGit()
          const cloneArgs = ['--depth', '1']
          if (parsed.ref) cloneArgs.push('--branch', parsed.ref)
          await git.clone(parsed.repoUrl!, packDir, cloneArgs)
          spin.succeed(`Cloned ${source}`)
        } else {
          const localPath = resolve(parsed.url)
          if (!existsSync(localPath)) {
            fatal(`Local path not found: ${localPath}`)
          }
          const dirName = localPath.split('/').pop() ?? 'pack'
          packDir = join(packsDir, dirName)

          if (existsSync(packDir)) {
            fatal(`Pack '${dirName}' already installed. Use \`openskulls remove ${dirName}\` first.`)
          }

          await symlink(localPath, packDir)
          log.success(`Linked ${localPath}`)
        }

        // Validate manifest
        const manifestPath = join(packDir, 'skull-pack.toml')
        if (!existsSync(manifestPath)) {
          fatal('Not a valid skill pack — missing skull-pack.toml')
        }

        const raw = await readFile(manifestPath, 'utf-8')
        const manifest = SkullPackManifest.parse(tomlParse(raw))

        // Validate referenced files exist
        for (const s of manifest.skills) {
          if (!existsSync(join(packDir, s.path))) {
            fatal(`Missing skill file: ${s.path}`)
          }
        }
        for (const r of manifest.rules) {
          if (!existsSync(join(packDir, r.path))) {
            fatal(`Missing rule file: ${r.path}`)
          }
        }

        log.success(`Validated pack: ${manifest.name} (${manifest.skills.length} skills, ${manifest.rules.length} rules)`)

        // Ensure .openskulls/packs/ is gitignored
        const gitignorePath = join(repoRoot, '.gitignore')
        if (existsSync(gitignorePath)) {
          const content = await readFile(gitignorePath, 'utf-8')
          if (!content.includes('.openskulls/packs/')) {
            await writeFile(gitignorePath, content.trimEnd() + '\n.openskulls/packs/\n', 'utf-8')
            log.success('Added .openskulls/packs/ to .gitignore')
          }
        } else {
          await writeFile(gitignorePath, '.openskulls/packs/\n', 'utf-8')
          log.success('Created .gitignore with .openskulls/packs/')
        }

        // Update config.toml
        const configPath = join(repoRoot, '.openskulls', 'config.toml')
        let configData: Record<string, unknown> = {}
        if (existsSync(configPath)) {
          configData = tomlParse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
        }
        const packs = (configData['installed_packs'] as Array<Record<string, unknown>>) ?? []
        packs.push({
          name: manifest.name,
          source: parsed.type,
          source_url: parsed.url,
          installed_at: new Date().toISOString(),
        })
        configData['installed_packs'] = packs
        await mkdir(dirname(configPath), { recursive: true })
        await writeFile(configPath, tomlStringify(configData), 'utf-8')

        log.success(`Added ${manifest.name} to config.toml`)
        log.info('Run `openskulls sync` to regenerate context files with the new pack.')
      } catch (err) {
        // Clean up on failure
        if (packDir && existsSync(packDir)) {
          await rm(packDir, { recursive: true, force: true }).catch(() => {})
        }
        if (err instanceof Error && err.message.startsWith('fatal(')) throw err
        fatal(
          'Failed to install pack',
          err instanceof Error ? err.message : String(err),
        )
      }
    })
}

/**
 * Pack loader — reads installed skill packs from .openskulls/packs/.
 *
 * loadInstalledPacks() globs for skull-pack.toml manifests, reads referenced
 * skill/rule files, and assembles SkullPackage objects for the generators.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as tomlParse } from 'smol-toml'
import { SkullPackManifest } from './manifest.js'
import type { SkullPackage, Skill, Rule } from './types.js'

export async function loadInstalledPacks(repoRoot: string): Promise<SkullPackage[]> {
  const packsDir = join(repoRoot, '.openskulls', 'packs')

  let entries: string[]
  try {
    entries = await readdir(packsDir)
  } catch {
    return []
  }

  const packs: SkullPackage[] = []

  for (const entry of entries) {
    const packDir = join(packsDir, entry)
    const manifestPath = join(packDir, 'skull-pack.toml')

    try {
      const info = await stat(packDir)
      if (!info.isDirectory()) continue

      const raw = await readFile(manifestPath, 'utf-8')
      const parsed = tomlParse(raw)
      const manifest = SkullPackManifest.parse(parsed)

      // Read skill file contents
      const skills: Skill[] = []
      for (const s of manifest.skills) {
        const content = await readFile(join(packDir, s.path), 'utf-8')
        skills.push({
          id: s.id,
          name: s.id,
          description: '',
          content,
          parameters: [],
          tags: [],
          dependsOn: [],
          toolCompatibility: s.tool_compatibility,
        })
      }

      // Read rule file contents
      const rules: Rule[] = []
      for (const r of manifest.rules) {
        const content = await readFile(join(packDir, r.path), 'utf-8')
        rules.push({
          id: r.id,
          name: r.id,
          description: '',
          content,
          severity: r.severity,
          section: r.section,
          tags: [],
          toolCompatibility: [],
        })
      }

      packs.push({
        schemaVersion: manifest.schema_version,
        name: manifest.name,
        version: '0.0.0',
        description: manifest.description,
        author: manifest.author,
        tags: manifest.tags,
        appliesWhen: {
          frameworks: manifest.applies_when.frameworks,
          languages: manifest.applies_when.languages,
        },
        skills,
        rules,
        contextSections: {},
        dependencies: [],
        peerDependencies: [],
      })
    } catch {
      // Skip invalid packs silently
      continue
    }
  }

  return packs
}

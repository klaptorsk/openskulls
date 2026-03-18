import { describe, expect, it, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadInstalledPacks } from '../../src/core/packages/loader.js'

function makeTempRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'openskulls-loader-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function writePackFiles(repoRoot: string, packName: string, manifest: string, files: Record<string, string> = {}): void {
  const packDir = join(repoRoot, '.openskulls', 'packs', packName)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, 'skull-pack.toml'), manifest, 'utf-8')
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(packDir, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }
}

let cleanup: (() => void) | undefined

afterEach(() => { cleanup?.(); cleanup = undefined })

describe('loadInstalledPacks', () => {
  it('returns empty array when no packs directory exists', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const result = await loadInstalledPacks(dir)
    expect(result).toEqual([])
  })

  it('loads a pack with one skill', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const manifest = `
name = "test-pack"
description = "A test pack"

[[skills]]
id = "add-widget"
path = "skills/add-widget/SKILL.md"
category = "workflow"
`
    writePackFiles(dir, 'test-pack', manifest, {
      'skills/add-widget/SKILL.md': '# Add Widget\n\nSome content.',
    })
    const packs = await loadInstalledPacks(dir)
    expect(packs).toHaveLength(1)
    expect(packs[0].name).toBe('test-pack')
    expect(packs[0].skills).toHaveLength(1)
    expect(packs[0].skills[0].id).toBe('add-widget')
    expect(packs[0].skills[0].content).toContain('# Add Widget')
  })

  it('loads a pack with one rule', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const manifest = `
name = "rule-pack"
description = "A rule pack"

[[rules]]
id = "no-any"
path = "rules/no-any.md"
section = "codeStyle"
severity = "error"
`
    writePackFiles(dir, 'rule-pack', manifest, {
      'rules/no-any.md': 'Do not use `any` type.',
    })
    const packs = await loadInstalledPacks(dir)
    expect(packs).toHaveLength(1)
    expect(packs[0].rules).toHaveLength(1)
    expect(packs[0].rules[0].content).toContain('Do not use')
  })

  it('skips packs with invalid manifest', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const packDir = join(dir, '.openskulls', 'packs', 'bad-pack')
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, 'skull-pack.toml'), 'this is not valid toml [[[', 'utf-8')
    const packs = await loadInstalledPacks(dir)
    expect(packs).toEqual([])
  })

  it('skips packs with missing referenced skill file', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    const manifest = `
name = "missing-file-pack"
description = "Has a missing skill file"

[[skills]]
id = "ghost"
path = "skills/ghost/SKILL.md"
`
    writePackFiles(dir, 'missing-file-pack', manifest)
    // Note: no actual skill file written
    const packs = await loadInstalledPacks(dir)
    expect(packs).toEqual([])
  })

  it('loads multiple packs', async () => {
    const { dir, cleanup: c } = makeTempRepo()
    cleanup = c
    writePackFiles(dir, 'pack-a', 'name = "pack-a"\ndescription = "A"', {})
    writePackFiles(dir, 'pack-b', 'name = "pack-b"\ndescription = "B"', {})
    const packs = await loadInstalledPacks(dir)
    expect(packs).toHaveLength(2)
  })
})

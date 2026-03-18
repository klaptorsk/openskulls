/**
 * Tests for foreign AI instruction file detection.
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  isForeignFile,
  scanForeignFiles,
  detectForeignSkillFiles,
  MANAGED_INSTRUCTION_FILES,
} from '../src/core/fingerprint/foreign-file-detector.js'

function makeDir(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'openskulls-foreign-test-'))
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(dir, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const MANAGED_CONTENT = [
  '# My Repo',
  '',
  '<!-- openskulls:section:overview -->',
  '## Overview',
  '<!-- /openskulls:section:overview -->',
].join('\n')

const FOREIGN_CONTENT = [
  '# My Repo',
  '',
  '## Overview',
  '',
  'This is a manually written file.',
  '',
  '## Rules',
  '- Always write tests.',
].join('\n')

describe('MANAGED_INSTRUCTION_FILES', () => {
  it('includes CLAUDE.md', () => {
    expect(MANAGED_INSTRUCTION_FILES).toContain('CLAUDE.md')
  })
  it('includes AGENTS.md', () => {
    expect(MANAGED_INSTRUCTION_FILES).toContain('AGENTS.md')
  })
  it('includes copilot-instructions.md', () => {
    expect(MANAGED_INSTRUCTION_FILES).toContain('.github/copilot-instructions.md')
  })
})

describe('isForeignFile', () => {
  it('returns true for a file with no openskulls markers', () => {
    expect(isForeignFile(FOREIGN_CONTENT)).toBe(true)
  })

  it('returns false for a file with openskulls markers', () => {
    expect(isForeignFile(MANAGED_CONTENT)).toBe(false)
  })

  it('returns true for an empty file', () => {
    expect(isForeignFile('')).toBe(true)
  })

  it('returns true for a file with only plain markdown', () => {
    expect(isForeignFile('# Title\n\nSome content.\n')).toBe(true)
  })

  it('returns false for a file with a single managed section', () => {
    const content = '<!-- openskulls:section:stack -->\n## Stack\n<!-- /openskulls:section:stack -->\n'
    expect(isForeignFile(content)).toBe(false)
  })
})

describe('scanForeignFiles', () => {
  it('returns empty scan result when no instruction files exist', async () => {
    const { dir, cleanup } = makeDir({})
    try {
      const result = await scanForeignFiles(dir)
      expect(result.foreignFiles).toHaveLength(0)
      expect(result.foreignSkills).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('detects a foreign CLAUDE.md', async () => {
    const { dir, cleanup } = makeDir({ 'CLAUDE.md': FOREIGN_CONTENT })
    try {
      const result = await scanForeignFiles(dir)
      expect(result.foreignFiles).toHaveLength(1)
      expect(result.foreignFiles[0]!.path).toBe('CLAUDE.md')
      expect(result.foreignFiles[0]!.content).toBe(FOREIGN_CONTENT)
    } finally {
      cleanup()
    }
  })

  it('does not report a managed CLAUDE.md as foreign', async () => {
    const { dir, cleanup } = makeDir({ 'CLAUDE.md': MANAGED_CONTENT })
    try {
      const result = await scanForeignFiles(dir)
      expect(result.foreignFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('detects foreign AGENTS.md', async () => {
    const { dir, cleanup } = makeDir({ 'AGENTS.md': FOREIGN_CONTENT })
    try {
      const result = await scanForeignFiles(dir)
      const paths = result.foreignFiles.map((f) => f.path)
      expect(paths).toContain('AGENTS.md')
    } finally {
      cleanup()
    }
  })

  it('detects multiple foreign files at once', async () => {
    const { dir, cleanup } = makeDir({
      'CLAUDE.md': FOREIGN_CONTENT,
      'AGENTS.md': FOREIGN_CONTENT,
    })
    try {
      const result = await scanForeignFiles(dir)
      expect(result.foreignFiles).toHaveLength(2)
    } finally {
      cleanup()
    }
  })

  it('detects foreign skill files in .claude/commands/', async () => {
    const { dir, cleanup } = makeDir({
      '.claude/commands/my-custom-skill.md': '# My Custom Skill\n\nDo something special.',
    })
    try {
      const result = await scanForeignFiles(dir)
      expect(result.foreignSkills).toContain('.claude/commands/my-custom-skill.md')
    } finally {
      cleanup()
    }
  })

  it('does not report managed skill files as foreign', async () => {
    const { dir, cleanup } = makeDir({
      '.claude/commands/run-tests.md': [
        '---',
        'description: Run the full test suite.',
        '---',
        '',
        '<!-- openskulls:section:content -->',
        'Run bun test.',
        '<!-- /openskulls:section:content -->',
      ].join('\n'),
    })
    try {
      const result = await scanForeignFiles(dir)
      // The run-tests.md has openskulls markers so it's not foreign
      expect(result.foreignSkills).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})

describe('detectForeignSkillFiles', () => {
  it('returns empty array when .claude/commands/ does not exist', async () => {
    const { dir, cleanup } = makeDir({})
    try {
      expect(await detectForeignSkillFiles(dir)).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('ignores non-.md files in .claude/commands/', async () => {
    const { dir, cleanup } = makeDir({
      '.claude/commands/notes.txt': 'not a skill',
    })
    try {
      expect(await detectForeignSkillFiles(dir)).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('returns relative paths with .claude/commands/ prefix', async () => {
    const { dir, cleanup } = makeDir({
      '.claude/commands/deploy.md': '# Deploy\n\nRun the deploy script.',
    })
    try {
      const result = await detectForeignSkillFiles(dir)
      expect(result[0]).toBe('.claude/commands/deploy.md')
    } finally {
      cleanup()
    }
  })
})

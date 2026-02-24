/**
 * Tests for the section merge strategy.
 *
 * mergeSections(existing, new) must:
 *  - Replace managed sections in place
 *  - Preserve manual text untouched
 *  - Keep managed sections that were removed from the template
 *  - Append new managed sections not yet in the existing file
 *  - Return newContent unchanged when existing is empty
 */

import { describe, expect, it } from 'vitest'
import { mergeSections, parseChunks, extractSections } from '../../src/core/generators/merge.js'

// ─── parseChunks ──────────────────────────────────────────────────────────────

describe('parseChunks', () => {
  it('returns a single manual chunk for plain text with no markers', () => {
    const chunks = parseChunks('hello world')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ kind: 'manual', text: 'hello world' })
  })

  it('parses a single managed section', () => {
    const content = `<!-- openskulls:section:overview -->\nsome content\n<!-- /openskulls:section:overview -->`
    const chunks = parseChunks(content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.kind).toBe('managed')
    if (chunks[0]!.kind === 'managed') {
      expect(chunks[0]!.id).toBe('overview')
    }
  })

  it('preserves text before and after a managed section', () => {
    const content = `before\n<!-- openskulls:section:s1 -->\nmanaged\n<!-- /openskulls:section:s1 -->\nafter`
    const chunks = parseChunks(content)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ kind: 'manual', text: 'before\n' })
    expect(chunks[1]!.kind).toBe('managed')
    expect(chunks[2]).toEqual({ kind: 'manual', text: '\nafter' })
  })

  it('handles multiple managed sections in sequence', () => {
    const content = [
      '<!-- openskulls:section:a -->',
      'content a',
      '<!-- /openskulls:section:a -->',
      '\n',
      '<!-- openskulls:section:b -->',
      'content b',
      '<!-- /openskulls:section:b -->',
    ].join('\n')
    const chunks = parseChunks(content)
    const managed = chunks.filter((c) => c.kind === 'managed')
    expect(managed).toHaveLength(2)
    expect((managed[0] as { kind: 'managed'; id: string; text: string }).id).toBe('a')
    expect((managed[1] as { kind: 'managed'; id: string; text: string }).id).toBe('b')
  })

  it('returns content unchanged when there are no markers', () => {
    const text = '# My File\n\nSome manual content.\n'
    const chunks = parseChunks(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.text).toBe(text)
  })
})

// ─── extractSections ──────────────────────────────────────────────────────────

describe('extractSections', () => {
  it('returns an empty map for no managed chunks', () => {
    const chunks = parseChunks('plain text')
    expect(extractSections(chunks).size).toBe(0)
  })

  it('returns a map of all managed section ids', () => {
    const content = [
      '<!-- openskulls:section:overview -->\nA\n<!-- /openskulls:section:overview -->',
      '\n',
      '<!-- openskulls:section:stack -->\nB\n<!-- /openskulls:section:stack -->',
    ].join('\n')
    const map = extractSections(parseChunks(content))
    expect(map.has('overview')).toBe(true)
    expect(map.has('stack')).toBe(true)
    expect(map.size).toBe(2)
  })
})

// ─── mergeSections ────────────────────────────────────────────────────────────

describe('mergeSections', () => {
  it('returns newContent unchanged when existing is empty', () => {
    const newContent = '# Repo\n\n<!-- openskulls:section:overview -->\nNew\n<!-- /openskulls:section:overview -->\n'
    expect(mergeSections('', newContent)).toBe(newContent)
  })

  it('returns newContent when existing has no managed sections', () => {
    const existing = '# My Repo\n\nManual notes here.\n'
    const newContent = '<!-- openskulls:section:overview -->\nGenerated\n<!-- /openskulls:section:overview -->\n'
    // existing has no markers → treated as empty-for-merge → return newContent
    // Actually per implementation: existing has no markers → one big manual chunk, sections from new get appended
    const result = mergeSections(existing, newContent)
    expect(result).toContain('Manual notes here.')
    expect(result).toContain('Generated')
  })

  it('replaces a managed section in place', () => {
    const existing = [
      '# Repo',
      '',
      '<!-- openskulls:section:overview -->',
      'Old content',
      '<!-- /openskulls:section:overview -->',
      '',
      'Manual footer',
    ].join('\n')

    const newContent = [
      '# Repo',
      '',
      '<!-- openskulls:section:overview -->',
      'New content',
      '<!-- /openskulls:section:overview -->',
    ].join('\n')

    const result = mergeSections(existing, newContent)
    expect(result).toContain('New content')
    expect(result).not.toContain('Old content')
    expect(result).toContain('Manual footer')
  })

  it('preserves manual edits between managed sections', () => {
    const existing = [
      '<!-- openskulls:section:a -->',
      'Old A',
      '<!-- /openskulls:section:a -->',
      '',
      '## My Hand-Written Section',
      'Keep this forever.',
      '',
      '<!-- openskulls:section:b -->',
      'Old B',
      '<!-- /openskulls:section:b -->',
    ].join('\n')

    const newContent = [
      '<!-- openskulls:section:a -->',
      'New A',
      '<!-- /openskulls:section:a -->',
      '<!-- openskulls:section:b -->',
      'New B',
      '<!-- /openskulls:section:b -->',
    ].join('\n')

    const result = mergeSections(existing, newContent)
    expect(result).toContain('New A')
    expect(result).toContain('New B')
    expect(result).not.toContain('Old A')
    expect(result).not.toContain('Old B')
    expect(result).toContain('My Hand-Written Section')
    expect(result).toContain('Keep this forever.')
  })

  it('preserves managed sections that were removed from the template', () => {
    const existing = [
      '<!-- openskulls:section:old-section -->',
      'This section was removed from the template.',
      '<!-- /openskulls:section:old-section -->',
      '',
      '<!-- openskulls:section:current -->',
      'Old current',
      '<!-- /openskulls:section:current -->',
    ].join('\n')

    const newContent = [
      '<!-- openskulls:section:current -->',
      'New current',
      '<!-- /openskulls:section:current -->',
    ].join('\n')

    const result = mergeSections(existing, newContent)
    expect(result).toContain('This section was removed from the template.')
    expect(result).toContain('New current')
  })

  it('appends new managed sections not yet in the existing file', () => {
    const existing = [
      '<!-- openskulls:section:overview -->',
      'Old overview',
      '<!-- /openskulls:section:overview -->',
    ].join('\n')

    const newContent = [
      '<!-- openskulls:section:overview -->',
      'New overview',
      '<!-- /openskulls:section:overview -->',
      '\n',
      '<!-- openskulls:section:brand-new -->',
      'Newly added section',
      '<!-- /openskulls:section:brand-new -->',
    ].join('\n')

    const result = mergeSections(existing, newContent)
    expect(result).toContain('New overview')
    expect(result).toContain('Newly added section')
  })

  it('is idempotent — merging the same content twice produces the same result', () => {
    const existing = [
      '# Repo',
      '',
      '<!-- openskulls:section:overview -->',
      'Old',
      '<!-- /openskulls:section:overview -->',
      '',
      'My notes.',
    ].join('\n')

    const newContent = [
      '# Repo',
      '',
      '<!-- openskulls:section:overview -->',
      'Generated',
      '<!-- /openskulls:section:overview -->',
    ].join('\n')

    const first  = mergeSections(existing, newContent)
    const second = mergeSections(first,    newContent)
    expect(first).toBe(second)
  })

  it('handles a real CLAUDE.md-shaped document', () => {
    const existing = [
      '# my-repo',
      '',
      '<!-- openskulls:section:overview -->',
      '## Project Overview',
      '',
      'Monolith application. Primary language: **TypeScript**.',
      '',
      '<!-- /openskulls:section:overview -->',
      '',
      '## My Custom Section',
      '',
      'I added this manually and it must be preserved.',
      '',
      '<!-- openskulls:section:agent_guidance -->',
      '## Agent Guidance',
      '',
      '- Old guidance',
      '',
      '<!-- /openskulls:section:agent_guidance -->',
    ].join('\n')

    const newContent = [
      '# my-repo',
      '',
      '<!-- openskulls:section:overview -->',
      '## Project Overview',
      '',
      'Monolith application. Primary language: **TypeScript** / **Next.js**.',
      '',
      '<!-- /openskulls:section:overview -->',
      '',
      '<!-- openskulls:section:agent_guidance -->',
      '## Agent Guidance',
      '',
      '- New guidance',
      '- Use Conventional Commits.',
      '',
      '<!-- /openskulls:section:agent_guidance -->',
    ].join('\n')

    const result = mergeSections(existing, newContent)

    // Updated sections
    expect(result).toContain('Next.js')
    expect(result).toContain('New guidance')
    expect(result).toContain('Use Conventional Commits.')

    // Old section content gone
    expect(result).not.toContain('Old guidance')
    expect(result).not.toContain('Primary language: **TypeScript**.')

    // Manual section preserved
    expect(result).toContain('My Custom Section')
    expect(result).toContain('I added this manually and it must be preserved.')
  })
})

/**
 * Section merge strategy for generated files.
 *
 * Regenerates only the openskulls-tagged sections in an existing file,
 * leaving all manually authored content untouched.
 *
 * Section markers (as written by the CLAUDE.md template):
 *   <!-- openskulls:section:<id> -->
 *   ...managed content...
 *   <!-- /openskulls:section:<id> -->
 *
 * If the file has no existing markers (first generation) the new content
 * is returned unchanged. If a section exists in both old and new, the new
 * version replaces it. Sections that exist only in the old file are kept.
 * Sections that exist only in the new file are appended at the end.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Chunk =
  | { kind: 'manual'; text: string }
  | { kind: 'managed'; id: string; text: string }

// ─── Parsing ─────────────────────────────────────────────────────────────────

const OPEN_RE  = /<!--\s*openskulls:section:([^\s>]+)\s*-->/
const CLOSE_RE = /<!--\s*\/openskulls:section:([^\s>]+)\s*-->/

/**
 * Split file content into alternating manual / managed chunks.
 * Order is preserved; manual chunks may be empty strings.
 */
export function parseChunks(content: string): Chunk[] {
  const chunks: Chunk[] = []
  let remaining = content

  while (remaining.length > 0) {
    const openMatch = OPEN_RE.exec(remaining)
    if (!openMatch) {
      // No more managed sections — rest is manual
      chunks.push({ kind: 'manual', text: remaining })
      break
    }

    const sectionId = openMatch[1]!
    const openStart = openMatch.index
    const openEnd = openStart + openMatch[0].length

    // Text before the opening marker is manual
    if (openStart > 0) {
      chunks.push({ kind: 'manual', text: remaining.slice(0, openStart) })
    }

    // Find the matching close marker
    const afterOpen = remaining.slice(openEnd)
    const closeMatch = new RegExp(`<!--\\s*/openskulls:section:${escapeRegex(sectionId)}\\s*-->`).exec(afterOpen)

    if (!closeMatch) {
      // Malformed — treat the rest as manual
      chunks.push({ kind: 'manual', text: remaining.slice(openStart) })
      break
    }

    const closeEnd = openEnd + closeMatch.index + closeMatch[0].length

    // The managed chunk includes both markers and everything between them
    chunks.push({ kind: 'managed', id: sectionId, text: remaining.slice(openStart, closeEnd) })

    remaining = remaining.slice(closeEnd)
  }

  return chunks
}

// ─── Section extraction ───────────────────────────────────────────────────────

/**
 * Extract a Map of sectionId → full section text (including markers)
 * from a parsed chunk list.
 */
export function extractSections(chunks: Chunk[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const chunk of chunks) {
    if (chunk.kind === 'managed') {
      map.set(chunk.id, chunk.text)
    }
  }
  return map
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Merge newContent into existingContent using the section strategy.
 *
 * - Managed sections present in newContent replace their counterparts in
 *   existingContent.
 * - Manual text in existingContent is preserved unchanged.
 * - Managed sections only in existingContent are preserved unchanged.
 * - Managed sections only in newContent are appended at the end.
 *
 * If existingContent is empty or has no managed sections, newContent is
 * returned as-is.
 */
export function mergeSections(existingContent: string, newContent: string): string {
  if (!existingContent.trim()) return newContent

  const existingChunks = parseChunks(existingContent)
  const newSections = extractSections(parseChunks(newContent))

  // Track which sections from newContent we've already placed
  const placed = new Set<string>()

  const parts: string[] = []

  for (const chunk of existingChunks) {
    if (chunk.kind === 'manual') {
      parts.push(chunk.text)
    } else {
      const replacement = newSections.get(chunk.id)
      if (replacement !== undefined) {
        parts.push(replacement)
        placed.add(chunk.id)
      } else {
        // Section removed from template — keep the old version
        parts.push(chunk.text)
      }
    }
  }

  // Append any new sections not yet in the existing file
  for (const [id, text] of newSections) {
    if (!placed.has(id)) {
      parts.push('\n' + text)
    }
  }

  return parts.join('')
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

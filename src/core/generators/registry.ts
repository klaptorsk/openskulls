/**
 * Generator registry.
 *
 * `getBuiltinGenerators()` returns one instance of every built-in generator.
 * `selectGenerators(toolIds)` filters to those whose toolId is in the given set.
 *
 * Always-on generators (e.g. claude_code) are included when the caller adds
 * their toolId to the active set. Detection-based generators (copilot, codex)
 * are included only when the fingerprint signals their presence.
 */

import type { Generator } from './base.js'
import { ClaudeCodeGenerator } from './claude-code.js'
import { CopilotGenerator } from './copilot.js'
import { CodexGenerator } from './codex.js'
import { CursorGenerator } from './cursor.js'

export function getBuiltinGenerators(): Generator[] {
  return [
    new ClaudeCodeGenerator(),
    new CopilotGenerator(),
    new CodexGenerator(),
    new CursorGenerator(),
  ]
}

export function selectGenerators(toolIds: ReadonlySet<string>): Generator[] {
  return getBuiltinGenerators().filter((g) => toolIds.has(g.toolId))
}

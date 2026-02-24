/**
 * Shared CLI utilities used by multiple commands.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mergeSections } from '../../core/generators/merge.js'
import type { GeneratedFile } from '../../core/generators/base.js'

/**
 * Write a GeneratedFile to disk, applying the correct merge strategy.
 * Creates parent directories if needed.
 */
export async function writeGeneratedFile(file: GeneratedFile, absPath: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true })

  if (file.mergeStrategy === 'merge_sections' && existsSync(absPath)) {
    const existing = await readFile(absPath, 'utf-8')
    const merged = mergeSections(existing, file.content)
    await writeFile(absPath, merged, 'utf-8')
    return
  }

  if (file.mergeStrategy === 'append' && existsSync(absPath)) {
    const existing = await readFile(absPath, 'utf-8')
    if (!existing.includes(file.content.trim())) {
      await writeFile(absPath, existing + '\n' + file.content, 'utf-8')
    }
    return
  }

  await writeFile(absPath, file.content, 'utf-8')
}

/**
 * Analyzer registry — returns all built-in analyzers.
 *
 * In v0.2+ this will also discover third-party analyzers from node_modules
 * (packages that declare an "openskulls.analyzers" export map entry).
 * For v0.1 the list is hardcoded.
 */

import type { Analyzer } from './base.js'
import { GoAnalyzer } from './language/go.js'
import { JavaScriptAnalyzer } from './language/javascript.js'
import { PythonAnalyzer } from './language/python.js'
import { TypeScriptAnalyzer } from './language/typescript.js'

export function getBuiltinAnalyzers(): Analyzer[] {
  return [
    new PythonAnalyzer(),
    new JavaScriptAnalyzer(),
    new TypeScriptAnalyzer(),
    new GoAnalyzer(),
  ]
}

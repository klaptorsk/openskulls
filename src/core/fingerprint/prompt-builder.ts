/**
 * buildAnalysisPrompt — constructs the AI analysis prompt.
 *
 * Pure function: no I/O, no side effects, fully deterministic.
 * The AI is asked to return a single JSON object matching AIAnalysisResponse.
 */

const MAX_TREE_ENTRIES = 500

export function buildAnalysisPrompt(
  repoName: string,
  fileTree: readonly string[],
  configContents: ReadonlyMap<string, string>,
): string {
  const treeLines =
    fileTree.length > MAX_TREE_ENTRIES
      ? [
          ...fileTree.slice(0, MAX_TREE_ENTRIES),
          `... (${fileTree.length - MAX_TREE_ENTRIES} more files not shown)`,
        ]
      : [...fileTree]

  const configSection = [...configContents.entries()]
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join('\n\n')

  return `You are analyzing a software repository named "${repoName}". Return ONLY a JSON object — no explanation, no markdown fences, no commentary.

The JSON must match this schema exactly:

{
  "languages": [
    {
      "name": "TypeScript",
      "version": "5.3.2",
      "confidence": "high",
      "percentage": 85,
      "evidence": ["tsconfig.json found"]
    }
  ],
  "frameworks": [
    {
      "name": "Next.js",
      "version": "14.0.0",
      "confidence": "high",
      "category": "fullstack",
      "evidence": ["next.config.js found"]
    }
  ],
  "conventions": [
    {
      "name": "conventional_commits",
      "value": "feat|fix|chore",
      "confidence": "high",
      "evidence": [".commitlintrc found"]
    }
  ],
  "dependencies": [
    {
      "runtime": { "react": "^18.0.0" },
      "dev": { "jest": "^29.0.0" },
      "peer": {},
      "sourceFile": "package.json"
    }
  ],
  "testing": {
    "framework": "vitest",
    "pattern": "**/*.test.ts",
    "coverageTool": "c8",
    "confidence": "high"
  },
  "cicd": {
    "platform": "github_actions",
    "workflows": ["ci.yml"],
    "hasDeploy": false,
    "deployTargets": [],
    "confidence": "high"
  },
  "linting": {
    "tools": ["eslint", "prettier"],
    "configFiles": [".eslintrc.json"],
    "styleRules": { "semi": "never" }
  },
  "architecture": {
    "style": "cli",
    "entryPoints": ["src/index.ts"],
    "moduleStructure": ["src", "tests"],
    "apiStyle": "rest",
    "database": "postgres",
    "hasMigrations": false
  },
  "description": "A CLI tool that..."
}

Field rules:
- "confidence" must be exactly "high", "medium", or "low" — no other values
- "languages[].percentage": number 0–100 representing estimated % of non-test source files
- "languages[].primary": omit — this is computed from percentage, not set by you
- "frameworks[].category": one of "frontend", "backend", "fullstack", "testing", "orm", "cli", "utility"
- "architecture.style": one of "monorepo", "monolith", "microservices", "library", "cli", "unknown"
- "architecture.apiStyle": one of "rest", "graphql", "grpc", "trpc" — omit if not applicable
- "testing", "cicd", "linting": omit the whole field if not detected
- "testing.pattern", "testing.coverageTool": omit if unknown
- "cicd.hasDeploy": true only if a deploy workflow/step is present
- "linting.styleRules": {} if no specific rules detected
- "description": one sentence from README or package.json description — omit if not found
- For any array with no data, use [] — do not omit the array
- Do not invent data not supported by the files shown

--- FILE TREE (${fileTree.length} files) ---
${treeLines.join('\n')}

--- CONFIG FILE CONTENTS ---
${configSection || '(no config files found)'}

Return only valid JSON. If unsure about a field, use [] for arrays or omit optional fields.`
}

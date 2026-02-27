# OpenSkulls — Task Tracker

> Updated: 2026-02-27

---

## Rules

- **Documentation**: whenever a feature is added or updated, `README.md` must be updated to reflect it. Mandatory.

---

## Active Tasks

| # | Task | Status |
|---|---|---|
| I-3 | Fix Copilot Windows/PowerShell prompt delivery — current env-var + `-Command` approach may mangle the prompt; investigate here-string and alternative invocation methods — see implementation notes below | ⬜ Pending |
| 6 | Interviewer — superseded by T-6 (AI-driven questionnaire). Static workflow questions (auto-docs, auto-commit, architect) kept; AI adds domain-specific questions on top. | 🔄 Superseded by T-6 |
| 7 | Dependency drift check + `openskulls audit` command | ⬜ Pending |
| 8 | `openskulls add` — local packages only (no registry yet) | ⬜ Pending |
| 14 | Skills remote — user configures a git remote (GitHub, GitLab, etc.) as their personal skills store; `openskulls skills push` publishes skills to that repo, `openskulls skills pull` fetches them into a new project | ⬜ Pending |
| 9 | Validate against a real external repo — confirm skill generation works end-to-end | ⬜ Pending |
| 10 | Decide: do we write anything into `.openskulls/` in the destination project? | ⬜ Pending |
| 11 | UI polish — align style with https://github.com/openclaw/openclaw | 🔄 In progress — @clack/prompts added (task 15 done) |
| 15 | Replace number-input menus with interactive arrow-key selectors — all prompts that currently ask the user to type a number (e.g. tool selection in `init.ts`, interviewer choices) should render as keyboard-navigable lists (highlight + Enter to confirm, multi-select where applicable) | ✅ Done — @clack/prompts |
| 12 | `openskulls init` should offer to create a `TASKS.md` task tracker in the destination project with relevant continous update as we code along| ⬜ Pending |
| 13 | Strenghten the promt for generating skills, also see if there is any exisisting skills from this or another source - ask for repo | ⬜ Pending |
| B-1 | Remove or hide stub commands before beta — `audit`, `add`, `publish` are registered in `--help` but do nothing; either implement stubs as 
| B-2 | Remove hardcoded `registry.openskulls.dev` default — `GlobalConfig.registryUrl` defaults to a non-existent domain; strip the field or leave it 

---

## Backlog

| # | Task | Status |
|---|---|---|
| T-8 | Workflow automation — help users define and maintain agentic skills/instructions | ⬜ Pending |
| T-10 | Optional agentic engineering workflow layer for any developer | ⬜ Pending |

---

## Notes

- R-1 through R-3 are a refactor sequence: R-1 must land before R-2, R-2 before R-3.
- T-6 extends task 6 (Interviewer) with deeper infra/platform questions.
- T-10 and T-8 overlap — keep as separate tracks (workflow definition vs. workflow automation).
- `detectAICLIs()` in `ai-collector.ts` already covers Claude Code, Copilot, Cursor — the registry (R-2) should drive which generators run based on these detections.

---

## I-2 Implementation Notes — Ask user for AI tool(s)

**Problem**: `detectAICLI()` auto-detects installed CLI by spawning processes. This is fragile, untestable, and not user-controlled. The same detection runs twice: once inside `AIFingerprintCollector.collect()` and once in `init.ts` Step 0.

**Files to change**:
- `src/core/fingerprint/ai-collector.ts`
- `src/cli/commands/init.ts`

### Change 1 — `ai-collector.ts`

Add optional 4th param to `AIFingerprintCollector.collect()`:

```ts
async collect(
  repoRoot: string,
  config?: Partial<ProjectConfig>,
  logger?: VerboseLogger,
  adapter?: AICLIAdapter,   // NEW: skip detectAICLI() when provided
): Promise<RepoFingerprint>
```

Inside the method, replace:
```ts
const cliCommand = await detectAICLI()
```
with:
```ts
const cliCommand = adapter ?? await detectAICLI()
```

### Change 2 — `init.ts` Step 0

Three-path logic:
- `--engine` flag → use it directly (existing behaviour, unchanged)
- `--yes` flag → fall back to `detectAICLI()` (non-interactive mode)
- interactive → **ask the user** (new behaviour)

**Question UI** (readline, before the analysis spinner):
```
  Which AI tool(s) do you use?
  openskulls will generate a context file for each selected tool.
    1  Claude Code     → CLAUDE.md + .claude/commands/
    2  GitHub Copilot  → .github/copilot-instructions.md
    3  OpenAI Codex    → AGENTS.md
    4  Cursor          → .cursor/rules/
  Enter numbers separated by commas [default: 1]:
  →
```

**Number → tool ID mapping**:
| # | Tool ID       | CLI command | invoke |
|---|---------------|-------------|--------|
| 1 | `claude_code` | `claude`    | stdin  |
| 2 | `copilot`     | `copilot`   | arg    |
| 3 | `codex`       | `codex`     | arg    |
| 4 | `cursor`      | —           | —      |

**Adapter resolution** — use the first selection that has a CLI (priority: claude > codex > copilot). If cursor-only is selected, fall back to `detectAICLI()`.

**Generator selection** — replaces the single-tool `ENGINE_TO_TOOL` lookup:
```ts
const toolsToGenerate = new Set<string>([
  ...selectedToolIds,                          // from user input
  ...fingerprint.aiCLIs.map((a) => a.tool),    // from existing repo files
])
```

Pass the resolved adapter into `collector.collect()` so it doesn't re-detect.

**Tests**: existing unit tests must still pass; the new `adapter?` param is backward-compatible (optional, defaults to auto-detect).

---

## I-3 Implementation Notes — Fix Copilot Windows/PowerShell prompt delivery

**History**: Two rounds of fixes already landed (`29fa254`, `ed45b47`). The current approach for PowerShell-mode CLIs in `invokeAICLI()` (`ai-collector.ts` ~line 290):

```ts
const psCmd = `${adapter.command} -p $env:__OPENSKULLS_PROMPT`
child = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
  env: { ...process.env, __OPENSKULLS_PROMPT: prompt },
})
```

**Suspected bugs**:
1. `-Command` expands `$env:__OPENSKULLS_PROMPT` but if the resulting string then contains PowerShell special chars (`"`, `$`, `` ` ``, newlines) the shell may re-process them before passing to `copilot`.
2. Multi-line prompts (our analysis prompts are large) are especially risky — PowerShell `-Command` treats newlines as statement separators.
3. Copilot may accept stdin, which would be safer than arg passing.

**Approaches to investigate** (in order of preference):

| Approach | How | Notes |
|---|---|---|
| **A. PowerShell here-string** | Pass prompt via a temp `.ps1` script using `@"..."@` → write to temp file, call with `-File` | Completely avoids `-Command` quoting issues |
| **B. `-EncodedCommand`** | Base64-encode the PS script that sets the prompt, use `-EncodedCommand` | No temp files, but complex encoding |
| **C. Stdin to PowerShell** | If copilot supports stdin, pipe prompt directly (like claude `stdin` mode) | Simplest — check if `copilot` supports `-p -` or similar |
| **D. Temp file** | Write prompt to a temp file, pass file path as `copilot -f <tmpfile>` | Depends on copilot CLI supporting file input |

**User note**: user has a working setup using PowerShell here-string `@"..."@` syntax — confirm with them what the working invocation looks like.

**File to change**: `src/core/fingerprint/ai-collector.ts`, specifically the `powershell` branch in `invokeAICLI()` (~line 290) and the `trySpawnVersion` helper.

**Test**: On Windows or via WSL+PowerShell, run `openskulls init` against a small test repo with copilot selected. Verify the full analysis prompt reaches the CLI without mangling.

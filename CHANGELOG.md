# Changelog

## 0.3.4 — 2026-04-11

### Bug Fixes

- **Stale task recovery:** Tasks stuck in `running` or `needs-input` with a dead agent process are now automatically recovered to `errored` when read by any command (#37)

### Features

- **Task timeout:** `--timeout <seconds>` flag on `exec`, `run`, and `answer` commands. Also configurable globally via `timeout:` in `.agex/config.yml`. Kills the agent and transitions to `errored` after the specified duration (#38)

### Performance

- **Parallel clean:** `agex clean` now removes completed tasks concurrently instead of sequentially (#39)

## 0.3.2 — 2026-04-11

### Features

- **Cancel command** (`agex cancel [id]`): Kill a running or needs-input agent task. Sends SIGTERM→SIGKILL to the agent process, also kills any dev server, clears server fields, and transitions the task to `errored` with "Cancelled by user". Available in CLI and MCP (`agex_cancel`).
- **`needs-input → errored` transition**: Cancel support required allowing tasks in `needs-input` state to transition to `errored`.

### Bug Fixes

- **Port allocation** (#35 partial): Port assignment no longer uses task count as index. `nextAvailablePort()` scans existing tasks' assigned ports and fills gaps, preventing collisions after task deletion.
- **Accept rejects failed tasks**: `accept` no longer allows merging tasks in `failed` status. The `failed → merged` state transition is removed, and `mergeableStatuses` is now `['ready', 'completed']` only.
- **Smart dirty check for accept** (#36): `accept` now only blocks when dirty working tree files overlap with the task branch's changed files. Unrelated dirty files (config edits, linter output) no longer block merges.
- **Porcelain parsing fix**: Fixed a `.trim()` bug in accept's dirty-file detection that could corrupt filenames starting with a space-prefixed status code (e.g., ` M file.txt`).

## 0.3.1 — 2026-04-11

### Breaking Changes (MCP)

- **MCP tool renames**: All `agex_task_*` tools renamed to `agex_*` (e.g., `agex_task_create` -> `agex_create`). Command renames: `agex_diff` -> `agex_review`, `agex_merge` -> `agex_accept`, `agex_discard` -> `agex_reject`, `agex_respond` -> `agex_answer`, `agex_log` -> `agex_output`.

### Features

- **Agent-centric command names**: `diff` -> `review`, `merge` -> `accept`, `discard` -> `reject`, `respond` -> `answer`, `log` -> `output`. Old names removed.
- **Flattened namespace**: `task create`, `task exec`, `task status`, `task start`, `task stop` are now top-level commands (`agex create`, `agex exec`, etc.). The `task` subcommand group is removed.
- **`answer --text`**: The `respond --answer` flag renamed to `answer --text` to avoid redundancy.

### Improvements

- **MCP server version**: Fixed stale `0.1.0` version string in MCP server (now matches package version).

## 0.3.0 — 2026-04-11

### Features

- **Error suggestions** (#31): Error JSON now includes a `suggestion` field with actionable recovery hints (e.g., `"Run 'agex list' to see available tasks"`). Human mode shows `→` hint lines. New `AgexError` class powers suggestions across all error paths.
- **Verify pass/fail** (#33): `agex verify` JSON output now includes `passed: boolean` and `summary: string` at the top level. Exit code 2 when checks fail (was 0).
- **Absolute worktree path** (#34): All task JSON output includes `absolute_worktree` — the computed absolute path to the worktree. Available in both CLI and MCP output.
- **Create task from GitHub issue** (#15): `agex task create --issue 45` (or `--issue owner/repo#45`, `--issue <url>`) pulls issue title, body, labels, and comments as the task prompt. Combine with `--prompt` for additional instructions. Requires `gh` CLI.
- **Homebrew formula** (#18): `brew install ruban-24/tap/agex` now works. Formula auto-updates on new releases via GitHub Actions.

### Improvements

- **Provisioning cleanup** (#32): Failed `task create` now auto-rolls back — deletes worktree, branch, and task JSON. No more orphaned resources. `agex clean` also handles `errored` tasks.
- **Dirty merge detection**: `agex merge` now detects uncommitted changes in the working tree before merging and shows a clear error instead of a misleading "Merge conflict" message.
- **Shell hardening**: GitHub issue fetcher uses `execa` array form instead of shell interpolation.
- **SKILL.md updated** for v0.3.0: documents `absolute_worktree`, `--issue`, verify `passed`/`summary`, error suggestions.

## 0.2.0 — 2026-04-11

### Features

- **Retry with feedback** (`agex retry <id> --feedback "..."`): Create a new task branching from a failed task's branch with an enhanced prompt containing the original prompt, structured failure context, and human feedback. Supports `--from-scratch` (branch from main), `--dry-run` (preview prompt), and `--wait`.
- **Needs-input state** (`agex respond <id> --answer "..."`): Agents can pause and ask questions by writing `.agex/needs-input.json` in their worktree. agex detects it, pauses the task, and the human responds. The agent is re-invoked with full Q&A context. Supports multiple rounds.
- **Structured verify output**: Verify commands accept parser configuration (`{ cmd: "npm test", parser: jest }`). Built-in parsers for jest/vitest, TypeScript, ESLint, and pytest extract file, line, message, expected/actual from raw output.
- **`task list` alias**: `agex task list` now works as an alias for the top-level `list` command.
- **MCP tools**: `agex_retry` and `agex_respond` added to the MCP server.
- **Dynamic version**: CLI version now reads from package.json instead of being hardcoded.

### Improvements

- **Human formatter updates**: `agex status --human` now shows parsed verify errors with file:line and expected/actual, needs-input questions with options, retry lineage, and contextual next-action hints for all states.
- **SKILL.md updates**: Added "When You're Stuck" section, "Retry with Feedback" workflow, updated command reference and common mistakes table, clarified verify vs direct test runs.
- **Unified task directory**: Renamed `.agex/worktrees/` to `.agex/tasks/` — worktree directories now live alongside task JSON files under a single directory.

### Breaking Changes

- **Directory rename**: `.agex/worktrees/` is now `.agex/tasks/`. Existing tasks created with v0.1.x will not be found. Run `agex clean` before upgrading, or manually move worktree directories.

## 0.1.1 — 2026-04-10

### Bug Fixes

- **Fix EEXIST crash during worktree provisioning**: `task create` no longer crashes when the symlink destination already exists (e.g. `node_modules` created by `git worktree add`). The symlink step now skips EEXIST gracefully.
- **Allow discard from provisioning state**: Tasks stuck in `provisioning` from a failed `task create` can now be discarded and cleaned up.
- **Fix `agex init` not exiting**: Interactive init could leave readline handles open, preventing the process from exiting.

## 0.1.0 — 2026-04-10

Initial public release.

### Features

- **Task lifecycle**: create, execute, verify, diff, compare, merge, discard, clean
- **Isolated workspaces** via git worktrees with automatic branch management
- **Blocking and non-blocking execution** with background lifecycle completion
- **Verification system** with configurable check commands and auto-detection (package.json, Makefile, pyproject.toml, Cargo.toml, go.mod)
- **Workspace provisioning**: file copy, symlink, setup hooks
- **Port isolation** via `AGEX_PORT` environment variable
- **Diff and compare**: stats, commit log, per-file changes, side-by-side comparison
- **Merge with conflict detection**: fast-forward or merge commit, worktree restored on conflict
- **Auto-commit uncommitted worktree changes** on merge, warn on discard/clean
- **Auto-infer task ID** from cwd when running inside a worktree
- **Interactive init** with guided setup and agent skill file generation
- **JSON output by default** (agent-first), `--human` flag for colored terminal output
- **MCP server** exposing all 14 commands as tools
- **Task state machine** with enforced valid transitions
- **Agent skill files** for Claude Code, Codex CLI, and Copilot CLI auto-discovery

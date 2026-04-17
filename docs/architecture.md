# Architecture

```
CLI (commander)
 ├── TaskManager      — task state machine, JSON persistence
 ├── WorkspaceManager — git worktree lifecycle, provisioning
 ├── AgentRunner      — subprocess spawn (blocking + non-blocking)
 ├── Verifier         — run checks, collect pass/fail results
 └── Reviewer         — diff stats, commit log, merge

MCP Server (stdio)
 └── wraps all 14 CLI commands as MCP tools
```

## Task Lifecycle

```
pending → provisioning → ready → running → verifying → completed → merged
                           │                         → failed    → discarded
                           ├──→ verifying (direct verify)
                           └──→ merged / discarded
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Agent command failed |
| `2` | Verification failed |
| `3` | Merge conflict |
| `4` | Invalid arguments |
| `5` | Workspace error |

## Activity Log

Activity is one of five read-only views on a task. `status` is a state snapshot; `list` and `summary` are cross-task views; `output` is the raw stdout/stderr stream the agent printed; `activity` is a structured event timeline of what the agent *did* — tool calls, subagents, verification, tokens.

Each task has an append-only JSONL event log at `.agex/tasks/<id>.activity.jsonl`. Events are one JSON object per line, ordered by timestamp. `agex activity <id>` reads, merges, and renders the stream.

**Dual capture.** Events come from two sources:

1. **Hook events** (real-time, Claude Code only) — `agex init` registers `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStart`, `SubagentStop`, `SessionEnd`, and `CwdChanged` hooks in `.claude/settings.local.json`. Each hook invokes `agex hook <event>`, which routes to the matching task via a 2-tier fallback and appends a normalized event:

   1. **`AGEX_TASK_ID` env var** — set by `agex` when spawning the worker; authoritative ownership signal. Every tool call a worker or its subagents emit routes here, even if the session `cd`s out mid-run.
   2. **Tool input path** (`file_path`, `path`, or `notebook_path`) matches `/.agex/tasks/<id>/`. Catches events from non-agex sessions that touch worktree files by absolute path (e.g. a root-cwd Claude session editing a file via its full path).

   The first tier that resolves wins. Events that fall through both tiers drop — we have no reliable ownership signal for them. To attach a manually-launched `claude` session to a specific task, set `AGEX_TASK_ID=<id>` (and `AGEX_WORKTREE=<abs-worktree-path>`) in its env before launch.

   This captures per-tool activity (`tool.call`, `tool.failed`, `turn.end`, `subagent.started/completed`, `session.end`) as it happens.
2. **Transcript replay** (post-hoc, all agents) — after a task finishes, the Claude Code transcript (`~/.claude/projects/…/*.jsonl`) is scanned and any missing session-level events are backfilled. This also runs when no hooks were active, so activity works in read-only fashion even without `agex init`.

**Lifecycle events** (`task.created`, `task.provisioned`, `task.exec.started`, `task.finished`, `task.verify`, `task.status_change`, `task.needs_input`, `task.answer`) are written by the CLI itself — they don't depend on hooks and work identically across all supported agents.

**Lazy aggregation.** The log isn't rolled up into a summary table; `agex activity` merges the JSONL, dedupes, and formats on demand. Storage cost is ~1 KB per tool call. On the first `agex status` or `agex activity` call after a run, aggregates (`token_usage`, `model`, `turn_count`, `files_modified`) are derived from the log and written back into the task record so subsequent `status` reads are cheap.

**Known limitations.**

- Real-time tool capture is Claude Code only. Codex and Copilot tasks get lifecycle + transcript-replay events but no per-tool timeline.
- Tools blocked client-side (e.g. the read-before-edit guard) never fire `PostToolUse*` hooks and so don't appear in the log. Adding `PreToolUse` + a synthetic `tool.rejected` event would close this gap.

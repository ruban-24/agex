# Human UX Design for agentpod CLI

## Context

agentpod is an agent-first CLI runtime. Agents interact via JSON output (default). Humans interact via `--human` flag on any command. The human is in the loop — they glance at dashboards, inspect tasks, decide whether to merge or discard — but they're not the primary consumer.

Currently, `--human` mode is just `JSON.stringify(data, null, 2)` for most commands. This spec redesigns every `--human` output surface to be genuinely useful to a human operator.

## Design Principles

1. **Agent output unchanged.** All changes are behind `--human`. JSON default stays exactly as-is.
2. **Cards over tables.** Card format (colored left border, stacked info) for most views. Tables only for `compare` where columnar comparison is the actual use case.
3. **Rich color, auto-stripped.** Full ANSI color when stdout is a TTY. Auto-strip when piped or redirected. No color in JSON mode.
4. **Next action hints.** Every action output ends with a `→ Next:` suggestion. Reduces "what do I do now?" friction for infrequent users.
5. **No raw code to humans.** Diff shows commits + file list, not raw diff hunks. The human's job is to decide, not to line-review — agents wrote the code.
6. **Summary footer.** Aggregate counts at the top of list/summary views for instant triage.

## Color System

| State | Color | Symbol |
|---|---|---|
| running | yellow | `▶` |
| completed | green | `✓` |
| failed | red | `✗` |
| errored | red | `✗` |
| merged | purple | `◆` |
| discarded | dim/gray | `○` |
| ready | blue | `●` |
| pending | dim/gray | `○` |
| verifying | yellow | `▶` |
| provisioning | yellow | `▶` |

Check results: `✓` green for pass, `✗` red for fail.
Diff stats: `+N` green, `-N` red.
File status: `A` green (added), `M` yellow (modified), `D` red (deleted).

## TTY Detection

When `--human` is passed:
- If `process.stdout.isTTY` is true: emit ANSI color codes.
- If `process.stdout.isTTY` is false (piped, redirected): strip ANSI codes, output plain text.
- JSON mode (no `--human`): never emit ANSI codes.

## Output Surfaces

### 1. `agentpod list --human`

Summary line + task cards.

```
3 tasks · 1 running · 1 completed · 1 failed

▶ a1b2c3  running   12s   Add auth middleware
✓ d4e5f6  completed 45s   3/3  +42 -8 · 3 files   Fix login bug
✗ g7h8i9  failed    23s   1/3  +15 -2 · 2 files   Refactor DB layer
```

Each task is a card with colored left border. Cards are sorted by priority: running/failed first (needs attention), then completed/ready, then merged/discarded last.

### 2. `agentpod task status <id> --human`

Full report card with sections.

```
┃ ✓ completed  d4e5f6  (45s)
┃ Fix login bug

DETAILS
  branch:   agentpod/d4e5f6
  cmd:      npm run fix-login
  created:  2 min ago
  duration: 45s

CHANGES
  +42 -8 across 3 files

VERIFICATION
  ✓ npm test      (0.8s)
  ✓ npm run lint  (1.2s)
  ✓ tsc --noEmit  (2.1s)

LOG (last 3 lines)
  ✓ All 47 tests passed
  ✓ No lint errors
  ✓ TypeScript compilation clean

→ Ready to merge: agentpod merge d4e5f6  or  agentpod diff d4e5f6 to review
```

The top card uses colored left border matching status. Section headers are dim uppercase labels. Log tail shows last 3 lines of the captured agent output. Next action hint at the bottom suggests the logical next command based on current status:
- `completed` → suggest merge or diff
- `failed` → suggest log or verify
- `running` → suggest status (check back)
- `ready` → suggest task exec
- `merged` → no suggestion

### 3. `agentpod summary --human`

Status dots header + task cards (same card format as `list`).

```
agentpod · 5 tasks
● 2 completed  ● 1 running  ● 1 failed  ● 1 merged

▶ a1b2c3  running   2m 15s  Add auth middleware
✗ g7h8i9  failed    23s     1/3 checks   Refactor DB layer
✓ d4e5f6  completed 45s     3/3 checks   Fix login bug
✓ b2c3d4  completed 1m 2s   3/3 checks   Add user settings page
◆ c3d4e5  merged    30s     Fix typo in README
```

Status dots are colored inline counts. Tasks sorted by priority (running/failed first).

### 4. `agentpod diff <id> --human`

Change overview: commits + file list. No raw diff hunks.

```
d4e5f6 · Fix login bug · +42 -8 across 3 files · 3 commits

COMMITS
  bae224d Add token validation logging and metrics
  c3f891a Fix session expiry check off-by-one
  7d2e4b1 Add regression tests for auth edge cases

FILES
  M src/auth.ts               +18 -5
  M src/middleware/session.ts  +12 -3
  A src/auth.test.ts          +12

→ Full diff: git diff main...agentpod/d4e5f6
```

Commit hashes are dimmed. File status indicators (M/A/D) are colored. The hint at the bottom gives the exact git command to get the raw diff if needed.

To get the commits, run `git log --oneline main...<branch>` against the task's branch. To get the file list with per-file stats, use `git diff --numstat main...<branch>` for machine-readable per-file counts (added, deleted, filename per line). The base branch is determined by finding the merge base of the task branch and the current HEAD — this is the same logic `reviewer.getDiff` already uses.

### 5. `agentpod verify <id> --human`

Checkmarks per check with timing + summary footer.

```
d4e5f6 · verification

✓ npm test      (0.8s)
✓ npm run lint  (1.2s)
✓ tsc --noEmit  (2.1s)

All 3 checks passed (4.1s total)
```

On failure, show first line of error output indented under the failed check:

```
g7h8i9 · verification

✓ npm run lint  (1.1s)
✗ npm test      (3.2s)
    FAIL src/db.test.ts › should handle connection timeout
✓ tsc --noEmit  (2.0s)

1 of 3 checks failed (6.3s total)
```

Summary line is green if all pass, red if any fail.

### 6. `agentpod compare <ids...> --human`

Table format (the one command that stays as a table — columnar comparison is the use case).

```
  ID      Status      Checks  Changes  Duration  Prompt
  ──────  ──────────  ──────  ───────  ────────  ──────────────────
  d4e5f6  ✓ completed 3/3     +42 -8   45s       Fix login bug
  g7h8i9  ✗ failed    1/3     +15 -2   23s       Refactor DB layer
  ──────  ──────────  ──────  ───────  ────────  ──────────────────
  2 tasks · 1 completed · 1 failed
```

Same color system applied to status, checks, and changes columns. Summary footer at the bottom.

### 7. Action Commands — Mini-cards

These commands: `init`, `task create`, `task exec`, `run`, `merge`, `discard`, `clean`.

Each outputs a mini-card with colored left border, key details, and next action hint.

**`init`:**
```
┃ ✓ Initialized agentpod in current repository
→ Next: agentpod task create --prompt "..."
```

**`task create`:**
```
┃ ✓ Created task a1b2c3
┃ Fix auth bug
┃ branch: agentpod/a1b2c3 · worktree: .agentpod/worktrees/a1b2c3
→ Next: agentpod task exec a1b2c3 --cmd "..." --wait
```

**`merge`:**
```
┃ ✓ Merged a1b2c3 into main
┃ strategy: fast-forward · commit: bae224d
→ Next: agentpod clean
```

**`discard`:**
```
┃ ○ Discarded g7h8i9 — Refactor DB layer
```

**`clean`:**
```
┃ ✓ Cleaned 2 worktrees (a1b2c3, g7h8i9)
```

**`run --wait`** (the most complex — creates + executes + verifies):
```
┃ ✓ completed  d4e5f6  (12s)
┃ Add tests
┃ +28 -3 · 2 files · checks 3/3
→ Next: agentpod diff d4e5f6 to review, agentpod merge d4e5f6 to accept
```

**`task exec --wait`:**
Same as `run --wait` but without the creation info.

**`task exec` (non-blocking, no `--wait`):**
```
┃ ▶ running  a1b2c3
┃ Add auth middleware
┃ pid: 12345
→ Check progress: agentpod task status a1b2c3
```

### 8. Error Output

In `--human` mode, errors are plain text instead of JSON:

```
error: Task not found: xyz123
```

```
error: Merge conflict on a1b2c3
→ Resolve manually in worktree: cd .agentpod/worktrees/a1b2c3
```

```
error: Cannot merge task in 'running' status (must be: ready, completed, failed)
```

The `handleError` function checks whether `--human` was passed and formats accordingly. JSON mode errors stay as `{"error": "message"}`.

## Implementation Scope

### Files to modify

- `src/cli/output.ts` — add color utilities, card formatter, status symbols, TTY detection, ANSI stripping
- `src/cli/commands/*.ts` — each command's action handler formats its own `--human` output using the new utilities
- `src/index.ts` — pass `human` flag to handleError for plain text errors
- `src/core/reviewer.ts` — add method to get commit log and per-file diff stats for the new diff view

### Files unchanged

- All JSON output paths (agent-facing)
- All core modules (task-manager, workspace-manager, agent-runner, verifier)
- MCP server
- All existing tests (they test behavior, not output formatting)

### New test coverage

- Unit tests for color utilities, card formatter, TTY detection
- Snapshot or assertion tests for each human-formatted output surface

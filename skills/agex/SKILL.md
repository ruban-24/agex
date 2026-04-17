---
name: agex
description: MUST invoke before implementing, building, fixing, or refactoring anything that touches more than one file. Default to using agex unless the change is a single-file trivial fix. Creates isolated worktrees — nothing touches main until verified and merged.
compatibility: Requires git and Node.js >= 20. agex must be installed globally (npm i -g @ruban24/agex).
---

# agex

## Overview

agex is a CLI runtime for running parallel AI coding tasks in isolated git worktrees. Instead of implementing one approach and hoping it works, fan out multiple approaches in parallel, verify all of them, and merge the best one.

**Mental model:** docker-compose for AI coding tasks. Each task gets its own branch and worktree. Nothing touches your main branch until you explicitly merge.

## When to Use

- Multiple viable approaches exist — explore them in parallel instead of picking one
- Task decomposes into independent subtasks that don't block each other
- Risky changes (refactors, migrations, experiments) need safe isolation
- You want verification (tests, lint, build) to gate merges
- You're in a git repository

**When NOT to use:**
- Trivial single-file edits where isolation adds no value
- Tasks with strict sequential dependencies
- Non-git projects

## Setup

```bash
# Initialize (auto-detects verify commands from package.json, Makefile, Cargo.toml, etc.)
agex init

# Or specify verify commands explicitly
agex init --verify "npm test" "npm run lint"
```

Optional `.agex/config.yml`:
```yaml
verify:
  - cmd: "npm test"
    parser: jest
  - cmd: "tsc --noEmit"
    parser: typescript
  - "npm run lint"          # plain string, no parser
copy:    [".env"]              # Files copied into each worktree
symlink: ["node_modules"]      # Shared directories symlinked
setup:   ["npm install"]       # Runs after workspace creation
run:                           # Dev server for each worktree
  cmd: "npm run dev"
  port_env: PORT
```

## Core Workflows

### 1. Fan Out Multiple Approaches

Explore the solution space — try N different approaches and pick the winner.

```bash
# Create isolated tasks for each approach
agex create --prompt "Implement caching using Redis"
agex create --prompt "Implement caching using in-memory LRU"
agex create --prompt "Implement caching using SQLite"

# Execute an agent in each worktree
agex exec <id1> --cmd "<your-agent> 'Implement Redis caching per the prompt'"
agex exec <id2> --cmd "<your-agent> 'Implement LRU caching per the prompt'"
agex exec <id3> --cmd "<your-agent> 'Implement SQLite caching per the prompt'"

# Wait for all to finish, then compare
agex compare <id1> <id2> <id3>

# Merge the best, discard the rest
agex accept <best-id>
agex reject <other-id>
agex reject <other-id>
agex clean
```

### 2. Parallel Independent Subtasks

Decompose a large task into pieces that don't depend on each other and run them simultaneously.

```bash
agex create --prompt "Add user authentication endpoints"
agex create --prompt "Add email notification service"
agex create --prompt "Add rate limiting middleware"

# Execute all (non-blocking by default — returns immediately)
agex exec <id1> --cmd "<your-agent> '...'"
agex exec <id2> --cmd "<your-agent> '...'"
agex exec <id3> --cmd "<your-agent> '...'"

# Monitor progress
agex summary

# Verify each, then merge passing tasks sequentially
agex verify <id1>
agex accept <id1>
agex verify <id2>
agex accept <id2>
agex verify <id3>
agex accept <id3>
agex clean
```

### 3. Isolated Single Task

Safely sandbox a risky change.

```bash
# Create + execute in one step (--wait blocks until done)
agex run --prompt "Migrate database schema to v2" --cmd "<your-agent> '...'" --wait

# Review and verify
agex review <id>
agex verify <id>

# Merge if good, discard if not
agex accept <id>    # or: agex reject <id>
```

### 4. Verify-Compare-Decide

Never merge blind. Always verify. Always compare when multiple tasks exist.

```bash
# Verify all candidates
agex verify <id1>
agex verify <id2>

# Compare: checks passed, diff size, files changed
agex compare <id1> <id2>

# Inspect the diffs if needed
agex review <id1>
agex review <id2>

# Decide and act
agex accept <winner>
agex reject <loser>
```

### 5. Retry with Feedback

Task failed verification? Retry with context instead of starting over.

```bash
# Task failed verification? Retry with context instead of starting over
agex retry <id> --feedback "The auth test fails because login() returns undefined — check the session module"

# Preview what the retry prompt will look like without creating a task
agex retry <id> --feedback "..." --dry-run

# Start fresh from main instead of building on the failed branch
agex retry <id> --feedback "..." --from-scratch
```

### 6. Clean Up

Prevent worktree and branch sprawl.

```bash
# Removes worktrees and state for all merged/discarded/completed/failed tasks
agex clean
```

Run `clean` after every merge/discard cycle.

### 7. Dev Server Per Task

Start a dev server in each worktree to visually test approaches.

```bash
# Config already has run field — start servers
agex start <id1>
agex start <id2>

# Check which URLs to test
agex status <id1>   # shows port and url
agex status <id2>

# Test, compare, then stop servers
agex stop <id1>
agex stop <id2>
```

For multi-service apps (frontend + backend), create separate tasks and read each task's URL from `status`.

### 8. Inspect a Run

After an agent task finishes, replay what it actually did before merging.

```bash
# Human-readable timeline: tool calls, subagents, verify result, token usage
agex activity <id> --human

# Machine-readable: JSONL stream of events for post-hoc analysis
agex activity <id>
```

Use this to:
- Sanity-check that the agent worked in the right files before `agex accept`
- Debug a failed run — which tool failed, with what error, on what input
- Compare two approaches by what they touched, not just the diff

Limitations: real-time tool capture is Claude Code only (via its hook API). Codex and Copilot tasks get lifecycle events (create, exec, verify, finish, subagent start/stop) but no per-tool timeline. Tools blocked client-side (e.g. read-before-edit guard) don't fire hooks, so they don't appear in the log.

### 9. When You're Stuck

When you hit a decision that requires human input, signal it instead of guessing:

1. Write a file in your worktree: `.agex/needs-input.json`
```json
{
  "question": "Should the auth module use JWT or server-side sessions?",
  "options": ["jwt", "sessions"],
  "context": "JWT is stateless but can't be revoked. Sessions need Redis."
}
```
2. Exit normally — agex will detect the file and pause the task
3. The human responds with `agex answer <id> --text "jwt"`
4. Your agent is re-invoked with the full Q&A context appended to the prompt

**Do this when:**
- There are multiple valid approaches and the choice depends on project constraints you don't know
- You need credentials, API keys, or configuration values
- The spec is ambiguous and guessing wrong would waste the entire task

## Quick Reference

| Command | Purpose |
|---------|---------|
| `agex init [--verify <cmds...>]` | Initialize in current repo |
| `agex create --prompt <text> [--issue <ref>]` | Create isolated task with its own worktree |
| `agex exec <id> --cmd <cmd> [--wait]` | Run command in task worktree |
| `agex start <id>` | Start dev server in task worktree |
| `agex stop <id>` | Stop dev server in task worktree |
| `agex status <id>` | Get task details |
| `agex run --prompt <text> --cmd <cmd> [--wait]` | Create + execute shortcut |
| `agex list` | List all tasks |
| `agex summary` | Status overview with counts |
| `agex output <id>` | Show captured agent output |
| `agex activity <id> [--human]` | Per-turn timeline of tool calls, subagents, verify, tokens (Claude Code only) |
| `agex verify <id>` | Run verification checks |
| `agex review <id>` | Show changes vs base branch |
| `agex compare <id1> <id2> [...]` | Side-by-side task comparison |
| `agex accept <id> [--reviewed]` | Merge task branch into current branch (`--reviewed` required in manual mode) |
| `agex reject <id>` | Remove task worktree and branch |
| `agex clean` | Clean up all finished tasks |
| `agex retry <id> --feedback <text>` | Retry failed task with feedback |
| `agex answer <id> --text <text>` | Answer a needs-input task question |

All commands output JSON by default. Add `--human` for colored terminal output.

## Task Lifecycle

```
pending -> provisioning -> ready -> running -> verifying -> completed -> merged
                                            -> needs-input -> running (after answer)
                                                           -> rejected
                                               verifying -> failed    -> retried (after retry)
                                                                      -> rejected
                                                          -> errored  -> retried (after retry)
                                                                      -> rejected
```

- `ready`: can execute, verify, accept, or reject
- `completed`/`failed`: can accept or reject
- `needs-input`: agent signaled it needs a human decision — answer to continue
- `retried`: task was superseded by a retry — terminal
- `merged`/`rejected`: terminal — task is done
- Merge conflicts auto-abort and reattach the worktree so work can continue

## Key Behaviors

- **JSON-first**: All output is JSON by default — designed for agent consumption
- **Auto-detection**: Verify commands detected from package.json, Makefile, pyproject.toml, Cargo.toml, go.mod
- **Port isolation**: Each task gets `AGEX_PORT` env var to avoid port conflicts
- **Env vars injected**: `AGEX_TASK_ID`, `AGEX_WORKTREE`, `AGEX_PORT`
- **Merge strategy**: Fast-forward first, merge commit fallback. Conflicts abort cleanly.
- **Exit codes**: 0=success, 1=agent failed, 2=verification failed, 3=merge conflict, 4=invalid args, 5=workspace error
- **Verify vs direct test runs**: During development, run specific tests directly (`npm test -- --grep "my test"`) for fast feedback. Use `agex verify` as the final validation — it runs all configured checks and records results on the task. Don't run the full test suite manually when `agex verify` does it for you.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Merging without verifying | Always `verify` before `accept` |
| Force-merging failed tasks | Reject and retry with better prompts |
| Creating dependent tasks in parallel | Only parallelize truly independent work |
| Skipping `compare` with multiple tasks | Compare reveals the best approach — don't guess |
| Forgetting to clean up | Run `agex clean` after merge/discard cycles |
| Using `--human` when parsing output | Default JSON is for agent logic — use `--human` only when presenting results to the user |
| Starting servers you don't need | Only `start` when you need to test the running app |
| Rejecting and recreating instead of retrying | Use `agex retry --feedback` to build on previous work |
| Erroring out when stuck on a decision | Write `.agex/needs-input.json` and exit — the human will respond |

## Human Review Gate

agex supports two review modes, configured in `.agex/config.yml`:

```yaml
review: manual  # or auto
```

### When `review: manual` (default)

**The CLI enforces this.** Running `agex accept <id>` without `--reviewed` or `--human` will fail with an error. You must get human approval first.

After verification passes:

1. Run `agex summary --human` and show the output to the user
2. For each task the user might accept, run `agex review <id> --human` and show the output
3. Ask the user: "These tasks passed verification. Accept them?"
4. Only run `agex accept <id> --reviewed` after the user confirms

The `--reviewed` flag is your assertion that the human approved the merge.

Example conversation flow:
```
Agent: All 3 tasks passed verification. Here are the results:

  [agex summary --human output]

  Task abc123 — JWT auth:
  [agex review abc123 --human output]

  Task def456 — Push notifications:
  [agex review def456 --human output]

  Accept both? Or would you like to review the full diffs first?

User: Accept both.

Agent: [runs agex accept abc123 --reviewed, agex accept def456 --reviewed]
```

### When `review: auto`

After verification passes, proceed directly to `agex accept` without asking — no `--reviewed` flag needed. Log what was merged so the user can see it after the fact.

### If no config exists

Default to `manual` behavior — `agex accept` will require `--reviewed` or `--human`.

### How the gate works

- `agex verify` and `agex summary` include `review_mode` in their JSON output — check this to know which mode you're in
- In manual mode, `agex accept <id>` without flags → error with instructions
- `agex accept <id> --reviewed` → merges (agent asserts human approved)
- `agex accept <id> --human` → merges (human is at the terminal)
- In auto mode, `agex accept <id>` → merges directly

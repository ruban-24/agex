---
name: agex
description: Use when working in a git repository and needing to run coding tasks in parallel, try multiple approaches, isolate risky changes in worktrees, compare agent outputs, or safely experiment without affecting the main branch. Also use when orchestrating multiple coding agents simultaneously.
compatibility: Requires git and Node.js >= 20. agex must be installed globally (npm i -g agex).
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
agex task create --prompt "Implement caching using Redis"
agex task create --prompt "Implement caching using in-memory LRU"
agex task create --prompt "Implement caching using SQLite"

# Execute an agent in each worktree
agex task exec <id1> --cmd "<your-agent> 'Implement Redis caching per the prompt'"
agex task exec <id2> --cmd "<your-agent> 'Implement LRU caching per the prompt'"
agex task exec <id3> --cmd "<your-agent> 'Implement SQLite caching per the prompt'"

# Wait for all to finish, then compare
agex compare <id1> <id2> <id3>

# Merge the best, discard the rest
agex merge <best-id>
agex discard <other-id>
agex discard <other-id>
agex clean
```

### 2. Parallel Independent Subtasks

Decompose a large task into pieces that don't depend on each other and run them simultaneously.

```bash
agex task create --prompt "Add user authentication endpoints"
agex task create --prompt "Add email notification service"
agex task create --prompt "Add rate limiting middleware"

# Execute all (non-blocking by default — returns immediately)
agex task exec <id1> --cmd "<your-agent> '...'"
agex task exec <id2> --cmd "<your-agent> '...'"
agex task exec <id3> --cmd "<your-agent> '...'"

# Monitor progress
agex summary

# Verify each, then merge passing tasks sequentially
agex verify <id1>
agex merge <id1>
agex verify <id2>
agex merge <id2>
agex verify <id3>
agex merge <id3>
agex clean
```

### 3. Isolated Single Task

Safely sandbox a risky change.

```bash
# Create + execute in one step (--wait blocks until done)
agex run --prompt "Migrate database schema to v2" --cmd "<your-agent> '...'" --wait

# Review and verify
agex diff <id>
agex verify <id>

# Merge if good, discard if not
agex merge <id>    # or: agex discard <id>
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
agex diff <id1>
agex diff <id2>

# Decide and act
agex merge <winner>
agex discard <loser>
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
agex task start <id1>
agex task start <id2>

# Check which URLs to test
agex task status <id1>   # shows port and url
agex task status <id2>

# Test, compare, then stop servers
agex task stop <id1>
agex task stop <id2>
```

For multi-service apps (frontend + backend), create separate tasks and read each task's URL from `task status`.

### 8. When You're Stuck

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
3. The human responds with `agex respond <id> --answer "jwt"`
4. Your agent is re-invoked with the full Q&A context appended to the prompt

**Do this when:**
- There are multiple valid approaches and the choice depends on project constraints you don't know
- You need credentials, API keys, or configuration values
- The spec is ambiguous and guessing wrong would waste the entire task

## Quick Reference

| Command | Purpose |
|---------|---------|
| `agex init [--verify <cmds...>]` | Initialize in current repo |
| `agex task create --prompt <text>` | Create isolated task with its own worktree |
| `agex task exec <id> --cmd <cmd> [--wait]` | Run command in task worktree |
| `agex task start <id>` | Start dev server in task worktree |
| `agex task stop <id>` | Stop dev server in task worktree |
| `agex task status <id>` | Get task details |
| `agex run --prompt <text> --cmd <cmd> [--wait]` | Create + execute shortcut |
| `agex list` | List all tasks |
| `agex summary` | Status overview with counts |
| `agex log <id>` | Show captured agent output |
| `agex verify <id>` | Run verification checks |
| `agex diff <id>` | Show changes vs base branch |
| `agex compare <id1> <id2> [...]` | Side-by-side task comparison |
| `agex merge <id>` | Merge task branch into current branch |
| `agex discard <id>` | Remove task worktree and branch |
| `agex clean` | Clean up all finished tasks |
| `agex retry <id> --feedback <text>` | Retry failed task with feedback |
| `agex respond <id> --answer <text>` | Answer a needs-input task question |

All commands output JSON by default. Add `--human` for colored terminal output.

## Task Lifecycle

```
pending -> provisioning -> ready -> running -> verifying -> completed -> merged
                                            -> needs-input -> running (after respond)
                                                           -> discarded
                                               verifying -> failed    -> retried (after retry)
                                                                      -> discarded
                                                          -> errored  -> retried (after retry)
                                                                      -> discarded
```

- `ready`: can execute, verify, merge, or discard
- `completed`/`failed`: can merge or discard
- `needs-input`: agent signaled it needs a human decision — respond to continue
- `retried`: task was superseded by a retry — terminal
- `merged`/`discarded`: terminal — task is done
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
| Merging without verifying | Always `verify` before `merge` |
| Force-merging failed tasks | Discard and retry with better prompts |
| Creating dependent tasks in parallel | Only parallelize truly independent work |
| Skipping `compare` with multiple tasks | Compare reveals the best approach — don't guess |
| Forgetting to clean up | Run `agex clean` after merge/discard cycles |
| Using `--human` in agent workflows | Default JSON output is designed for agents — use it |
| Starting servers you don't need | Only `task start` when you need to test the running app |
| Discarding and recreating instead of retrying | Use `agex retry --feedback` to build on previous work |
| Erroring out when stuck on a decision | Write `.agex/needs-input.json` and exit — the human will respond |

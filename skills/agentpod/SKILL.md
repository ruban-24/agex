---
name: agentpod
description: Use when working in a git repository and needing to run coding tasks in parallel, try multiple approaches, isolate risky changes in worktrees, compare agent outputs, or safely experiment without affecting the main branch. Also use when orchestrating multiple coding agents simultaneously.
compatibility: Requires git and Node.js >= 20. agentpod must be installed globally (npm i -g agentpod).
---

# agentpod

## Overview

agentpod is a CLI runtime for running parallel AI coding tasks in isolated git worktrees. Instead of implementing one approach and hoping it works, fan out multiple approaches in parallel, verify all of them, and merge the best one.

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
agentpod init

# Or specify verify commands explicitly
agentpod init --verify "npm test" "npm run lint"
```

Optional `.agentpod/config.yml`:
```yaml
verify:  ["npm test", "npm run lint"]
copy:    [".env"]              # Files copied into each worktree
symlink: ["node_modules"]      # Shared directories symlinked
setup:   ["npm install"]       # Runs after workspace creation
```

## Core Workflows

### 1. Fan Out Multiple Approaches

Explore the solution space — try N different approaches and pick the winner.

```bash
# Create isolated tasks for each approach
agentpod task create --prompt "Implement caching using Redis"
agentpod task create --prompt "Implement caching using in-memory LRU"
agentpod task create --prompt "Implement caching using SQLite"

# Execute an agent in each worktree
agentpod task exec <id1> --cmd "<your-agent> 'Implement Redis caching per the prompt'"
agentpod task exec <id2> --cmd "<your-agent> 'Implement LRU caching per the prompt'"
agentpod task exec <id3> --cmd "<your-agent> 'Implement SQLite caching per the prompt'"

# Wait for all to finish, then compare
agentpod compare <id1> <id2> <id3>

# Merge the best, discard the rest
agentpod merge <best-id>
agentpod discard <other-id>
agentpod discard <other-id>
agentpod clean
```

### 2. Parallel Independent Subtasks

Decompose a large task into pieces that don't depend on each other and run them simultaneously.

```bash
agentpod task create --prompt "Add user authentication endpoints"
agentpod task create --prompt "Add email notification service"
agentpod task create --prompt "Add rate limiting middleware"

# Execute all (non-blocking by default — returns immediately)
agentpod task exec <id1> --cmd "<your-agent> '...'"
agentpod task exec <id2> --cmd "<your-agent> '...'"
agentpod task exec <id3> --cmd "<your-agent> '...'"

# Monitor progress
agentpod summary

# Verify each, then merge passing tasks sequentially
agentpod verify <id1>
agentpod merge <id1>
agentpod verify <id2>
agentpod merge <id2>
agentpod verify <id3>
agentpod merge <id3>
agentpod clean
```

### 3. Isolated Single Task

Safely sandbox a risky change.

```bash
# Create + execute in one step (--wait blocks until done)
agentpod run --prompt "Migrate database schema to v2" --cmd "<your-agent> '...'" --wait

# Review and verify
agentpod diff <id>
agentpod verify <id>

# Merge if good, discard if not
agentpod merge <id>    # or: agentpod discard <id>
```

### 4. Verify-Compare-Decide

Never merge blind. Always verify. Always compare when multiple tasks exist.

```bash
# Verify all candidates
agentpod verify <id1>
agentpod verify <id2>

# Compare: checks passed, diff size, files changed
agentpod compare <id1> <id2>

# Inspect the diffs if needed
agentpod diff <id1>
agentpod diff <id2>

# Decide and act
agentpod merge <winner>
agentpod discard <loser>
```

### 5. Discard and Retry

When approaches fail verification, don't force-merge. Learn and retry.

```bash
# Understand what went wrong
agentpod log <id>
agentpod diff <id>

# Discard failed attempts
agentpod discard <id1>
agentpod discard <id2>

# Retry with refined prompts incorporating what you learned
agentpod run --prompt "Implement X using Y (avoid Z because it caused ...)" --cmd "..."
```

### 6. Clean Up

Prevent worktree and branch sprawl.

```bash
# Removes worktrees and state for all merged/discarded/completed/failed tasks
agentpod clean
```

Run `clean` after every merge/discard cycle.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `agentpod init [--verify <cmds...>]` | Initialize in current repo |
| `agentpod task create --prompt <text>` | Create isolated task with its own worktree |
| `agentpod task exec <id> --cmd <cmd> [--wait]` | Run command in task worktree |
| `agentpod task status <id>` | Get task details |
| `agentpod run --prompt <text> --cmd <cmd> [--wait]` | Create + execute shortcut |
| `agentpod list` | List all tasks |
| `agentpod summary` | Status overview with counts |
| `agentpod log <id>` | Show captured agent output |
| `agentpod verify <id>` | Run verification checks |
| `agentpod diff <id>` | Show changes vs base branch |
| `agentpod compare <id1> <id2> [...]` | Side-by-side task comparison |
| `agentpod merge <id>` | Merge task branch into current branch |
| `agentpod discard <id>` | Remove task worktree and branch |
| `agentpod clean` | Clean up all finished tasks |

All commands output JSON by default. Add `--human` for colored terminal output.

## Task Lifecycle

```
pending -> provisioning -> ready -> running -> verifying -> completed -> merged
                                                         -> failed    -> discarded
```

- `ready`: can execute, verify, merge, or discard
- `completed`/`failed`: can merge or discard
- `merged`/`discarded`: terminal — task is done
- Merge conflicts auto-abort and reattach the worktree so work can continue

## Key Behaviors

- **JSON-first**: All output is JSON by default — designed for agent consumption
- **Auto-detection**: Verify commands detected from package.json, Makefile, pyproject.toml, Cargo.toml, go.mod
- **Port isolation**: Each task gets `AGENTPOD_PORT` env var to avoid port conflicts
- **Env vars injected**: `AGENTPOD_TASK_ID`, `AGENTPOD_WORKTREE`, `AGENTPOD_PORT`
- **Merge strategy**: Fast-forward first, merge commit fallback. Conflicts abort cleanly.
- **Exit codes**: 0=success, 1=agent failed, 2=verification failed, 3=merge conflict, 4=invalid args, 5=workspace error

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Merging without verifying | Always `verify` before `merge` |
| Force-merging failed tasks | Discard and retry with better prompts |
| Creating dependent tasks in parallel | Only parallelize truly independent work |
| Skipping `compare` with multiple tasks | Compare reveals the best approach — don't guess |
| Forgetting to clean up | Run `agentpod clean` after merge/discard cycles |
| Using `--human` in agent workflows | Default JSON output is designed for agents — use it |

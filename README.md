# agentpod

An agent-first, local-first CLI runtime that treats AI coding tasks as reproducible local jobs — isolate, execute, verify, compare, merge or discard.

<!-- TODO: Add demo GIF here -->
<!-- ![agentpod demo](./docs/demo.gif) -->

## What is agentpod?

agentpod gives AI coding agents (Claude Code, Codex CLI, Aider, etc.) isolated workspaces via git worktrees to run parallel tasks safely in your repo. The developer steers, agents write code, agentpod is the infrastructure.

- **Agent-agnostic** — works with any CLI-based AI coding tool
- **Parallel execution** — run 2-10 tasks simultaneously in isolated worktrees
- **Full lifecycle** — create, execute, verify, compare, merge or discard
- **Invisible to the repo** — all state in `.agentpod/` (gitignored), no team buy-in needed
- **Local-first** — no cloud, no accounts, no dependencies beyond git and Node.js
- **MCP server included** — agents discover agentpod natively via Model Context Protocol

## Install

```bash
npm install -g agentpod
```

Requires Node.js >= 20 and git.

## Quick Start

```bash
# Initialize in your repo
agentpod init --verify "npm test"

# Run a task (create workspace + execute command)
agentpod run --prompt "refactor auth to use JWT" --cmd "claude -p 'refactor auth'" --wait

# Or create a workspace and work in it directly
agentpod task create --prompt "fix login bug"
# → your agent works in .agentpod/worktrees/<id>/

# Check results
agentpod verify <id>
agentpod diff <id>

# Accept or reject
agentpod merge <id>    # merge into current branch
agentpod discard <id>  # throw it away
agentpod clean         # remove finished task worktrees
```

## How It Works

```
Developer tells their agent:
  → "try 3 approaches to refactor auth"

Agent calls agentpod:
  → agentpod run --prompt "approach 1: JWT" --cmd "claude -p '...'"
  → agentpod run --prompt "approach 2: sessions" --cmd "codex -q '...'"
  → agentpod run --prompt "approach 3: OAuth" --cmd "aider '...'"

Agent reviews:
  → agentpod compare <id1> <id2> <id3>
  → agentpod merge <winning-id>
  → agentpod clean
```

Two execution paths:

| Path | Command | Use case |
|------|---------|----------|
| **Workspace only** | `agentpod task create` | Agent works in the worktree directly |
| **Workspace + subprocess** | `agentpod run --cmd "..."` | Delegate to another agent |

## Commands

All commands output JSON by default (agent-first). Add `--human` for colored terminal output.

| Command | Description |
|---------|-------------|
| `agentpod init` | Initialize agentpod in the current repo |
| `agentpod task create --prompt "..."` | Create an isolated workspace |
| `agentpod task exec <id> --cmd "..."` | Run a command in a task's worktree |
| `agentpod task status <id>` | Get task details |
| `agentpod run --prompt "..." --cmd "..."` | Shortcut: create + exec |
| `agentpod list` | List all tasks |
| `agentpod log <id>` | Show captured agent output |
| `agentpod verify <id>` | Run verification checks |
| `agentpod diff <id>` | Show diff stats, commits, per-file changes |
| `agentpod compare <id1> <id2> ...` | Compare tasks side-by-side |
| `agentpod summary` | Status breakdown of all tasks |
| `agentpod merge <id>` | Merge task branch into current branch |
| `agentpod discard <id>` | Remove task worktree and branch |
| `agentpod clean` | Clean up all finished tasks |

## Configuration

Create `.agentpod/config.yml` (or pass `--verify` to `init`):

```yaml
# Commands to verify task results
verify:
  - "npm test"
  - "npm run lint"

# Files to copy into each worktree
copy:
  - ".env"
  - "config/local.json"

# Directories to symlink (shared, not copied)
symlink:
  - "node_modules"

# Commands to run after workspace creation
setup:
  - "npm install"
```

If no verify commands are configured, agentpod auto-detects from your project files (package.json, Makefile, pyproject.toml, Cargo.toml, go.mod).

## Task Lifecycle

```
pending → provisioning → ready → running → verifying → completed → merged
                                                     → failed    → discarded
                                  ready → verifying (direct verify)
                                  ready → merged/discarded
```

## MCP Server

agentpod includes an MCP server so agents can discover it natively:

```json
{
  "mcpServers": {
    "agentpod": {
      "command": "agentpod-mcp",
      "args": []
    }
  }
}
```

All 14 CLI commands are exposed as MCP tools.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Agent command failed |
| 2 | Verification failed |
| 3 | Merge conflict |
| 4 | Invalid arguments |
| 5 | Workspace error |

## License

[MIT](LICENSE)

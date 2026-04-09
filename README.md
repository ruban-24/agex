<p align="center">
  <h1 align="center">agentpod</h1>
  <p align="center">
    <strong>Your agent works in parallel. You pick the winner.</strong>
  </p>
  <p align="center">
    Isolate. Execute. Verify. Compare. Merge or discard.
  </p>
  <p align="center">
    <a href="https://github.com/ruban-24/agentpod/actions"><img src="https://github.com/ruban-24/agentpod/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/agentpod"><img src="https://img.shields.io/npm/v/agentpod.svg" alt="npm version"></a>
    <a href="https://github.com/ruban-24/agentpod/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/agentpod.svg" alt="license"></a>
    <a href="https://www.npmjs.com/package/agentpod"><img src="https://img.shields.io/node/v/agentpod.svg" alt="node version"></a>
    <a href="https://github.com/ruban-24/agentpod"><img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  </p>
</p>

<!-- TODO: Uncomment after recording with VHS -->
<!-- <p align="center">
  <img src="./docs/demo.gif" alt="agentpod demo" width="800">
</p> -->

---

## Why agentpod?

AI coding agents are fast — but they work on your branch, one task at a time.

**What if you could run 5 agents in parallel, each in an isolated workspace, and pick the best result?**

agentpod gives your agent a fleet of git worktrees. Each task gets its own branch — full isolation, no conflicts. Your agent creates tasks, runs them in parallel, verifies results automatically, and you decide what ships.

**For you:** install, init, go back to what you were doing. Check in when you want with `agentpod summary --human`.

**For your agent:** 14 commands covering the full lifecycle — create, execute, verify, compare, merge, discard. JSON output by default. Agent skill files for auto-discovery.

**No cloud. No accounts. No team buy-in needed.** Everything lives in `.agentpod/` (gitignored) and optional skill files (committed).

## How It Works

```
1. You run    →  agentpod init             →  guided setup, drops agent skill files
2. Agent works →  creates tasks in parallel  →  isolated worktrees, auto-verification
3. You decide  →  agentpod summary --human   →  merge the winner, discard the rest
```

That's the whole model. You run one command. Your agent does the rest. You check in when you want.

**Under the hood**, your agent uses agentpod to:
- Create isolated git worktrees (one per task, own branch)
- Execute commands in each worktree (other agents, scripts, anything)
- Run verification (tests, lint, build) automatically
- Provision workspaces (copy secrets, symlink dependencies, run setup hooks)
- Compare results side-by-side
- Merge the best approach into your branch

## Get Started

```bash
npm install -g agentpod
cd your-project
agentpod init
```

Requires **Node.js >= 20** and **git**.

`agentpod init` auto-detects your project, asks a few questions, and drops a skill file so your agent discovers agentpod automatically. After init, go back to your agent and give it a task:

> *"Use agentpod to try 3 different approaches to refactor the auth module, then compare and merge the best one."*

## What Does It Look Like?

Add `--human` to any command for colored terminal output. Here's what a typical session looks like:

**Check on all tasks:**
```
$ agentpod summary --human

agentpod · 3 tasks
3 tasks · 1 completed · 1 running · 1 failed

┃ ✓  abc123  completed   12.4s  3/3  +47 -12 · 4 files   JWT approach
┃ ▶  def456  running      8.1s                             Sessions approach
┃ ✗  ghi789  failed      15.2s  1/3  +93 -41 · 14 files   OAuth approach
```

**Verify a task's results:**
```
$ agentpod verify abc123 --human

abc123 · verification

✓ npm test          (4.2s)
✓ npm run lint      (2.1s)
✓ npm run build     (6.1s)

All 3 checks passed (12.4s total)
```

**Review changes:**
```
$ agentpod diff abc123 --human

abc123 · JWT approach · +47 -12 across 4 files · 3 commits

COMMITS
  a1b2c3d  refactor: extract auth middleware
  d4e5f6a  feat: add JWT token generation
  b7c8d9e  test: add auth middleware tests

FILES
  M src/auth/middleware.ts    +18 -4
  M src/auth/token.ts         +12 -2
  A src/auth/jwt.ts           +15 -0
  M tests/auth.test.ts         +2 -6

→ Full diff: git diff HEAD...agentpod/abc123
```

**Compare and decide** (once all tasks finish):
```
$ agentpod compare abc123 def456 ghi789 --human

  ID       Status      Checks  Changes  Duration  Prompt
  ──────────────────────────────────────────────────────────
  abc123   completed   3/3     +47 -12  12.4s     JWT approach
  def456   completed   3/3     +31 -8    9.2s     Sessions approach
  ghi789   failed      1/3     +93 -41  15.2s     OAuth approach
  ──────────────────────────────────────────────────────────
  3 tasks · 2 completed · 1 failed
```

## When to Reach for agentpod

- **You want to try multiple approaches and pick the best** — fan out 3 ideas, verify all, merge the winner
- **You have independent subtasks that can run in parallel** — auth, notifications, and rate limiting don't block each other
- **You want to experiment without risking your branch** — every task is an isolated worktree, discard costs nothing
- **You're orchestrating multiple agents on the same codebase** — Claude Code dispatches work to Codex, Aider, or any CLI tool
- **You want automated verification before merging agent output** — tests, lint, and build run automatically

### When NOT to reach for agentpod

- **Trivial single-file edits** — isolation overhead isn't worth it, just let your agent edit directly
- **Strictly sequential tasks** — if step 2 depends on step 1's output, parallelism can't help
- **Non-git projects** — agentpod requires git for worktree isolation

## Agent Setup Guides

`agentpod init` drops a skill file into your repo so your agent discovers agentpod automatically. No manual configuration needed.

### Claude Code

After `agentpod init`, Claude Code auto-discovers the skill file at `.claude/skills/agentpod/SKILL.md`. Just start Claude Code and give it a task:

> *"Use agentpod to try two approaches to refactor the auth module — one using JWT, one using sessions. Compare and merge the best."*

> *"Use agentpod to run the API refactor and the frontend migration in parallel."*

> *"Use agentpod to isolate this risky database migration so I can review it before it touches my branch."*

### Codex CLI

After `agentpod init`, Codex CLI auto-discovers the skill file at `.agents/skills/agentpod/SKILL.md`. Start Codex and give it a task:

> *"Use agentpod to try three different caching strategies, verify each, and merge the fastest."*

### Copilot CLI

After `agentpod init`, Copilot CLI auto-discovers the skill file at `.github/skills/agentpod/SKILL.md`. Start Copilot and give it a task:

> *"Use agentpod to parallelize the test suite refactor — split it into auth tests, API tests, and UI tests."*

### Cross-Agent Orchestration

Your primary agent can delegate subtasks to other agents via agentpod:

> *"Use agentpod to run these in parallel: have Claude Code refactor auth, and have Codex refactor the API layer. Compare results and merge the best of each."*

This works because `agentpod run --cmd "..."` can invoke any CLI tool as a subprocess.

## Commands

All commands output JSON by default — designed for agent consumption. Add `--human` for colored terminal output when you're checking in.

### Task Lifecycle

| Command | Description |
|---------|-------------|
| `agentpod init` | Initialize agentpod (interactive guided setup) |
| `agentpod task create --prompt "..."` | Create an isolated workspace |
| `agentpod task exec <id> --cmd "..." [--wait]` | Run a command in a task's worktree |
| `agentpod run --prompt "..." --cmd "..." [--wait]` | Shortcut: create + exec |

### Monitoring

| Command | Description |
|---------|-------------|
| `agentpod task status <id>` | Get detailed task info |
| `agentpod list` | List all tasks |
| `agentpod log <id>` | Show captured agent output |
| `agentpod summary` | Status breakdown of all tasks |

### Review

| Command | Description |
|---------|-------------|
| `agentpod verify <id>` | Run verification checks |
| `agentpod diff <id>` | Diff stats, commits, per-file changes |
| `agentpod compare <id1> <id2> ...` | Compare tasks side-by-side |

### Resolution

| Command | Description |
|---------|-------------|
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
  - "npm run build"

# Files to copy into each worktree (e.g., secrets not in git)
copy:
  - ".env"
  - "config/local.json"

# Directories to symlink into worktrees (shared, not copied)
symlink:
  - "node_modules"

# Commands to run after workspace creation
setup:
  - "npm install"
```

### Auto-Detection

If no `verify` commands are configured, agentpod auto-detects from your project:

| File | Detected commands |
|------|-------------------|
| `package.json` | `npm test`, `npm run lint`, `npm run build` |
| `Makefile` | `make test` |
| `pyproject.toml` | `pytest` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |

## Architecture

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

### Task Lifecycle

```
pending → provisioning → ready → running → verifying → completed → merged
                           │                         → failed    → discarded
                           ├──→ verifying (direct verify)
                           └──→ merged / discarded
```

## MCP Server (Optional)

agentpod includes an MCP server for agents that support Model Context Protocol. This is **not required** — `agentpod init` sets up agent skill files which are the recommended integration path. Use this if your agent or IDE specifically supports MCP tool discovery.

Add to your MCP client config:

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

**Claude Code** — add to `.claude/settings.json` or `~/.claude/settings.json`

**Cursor** — add to `.cursor/mcp.json`

All 14 CLI commands are exposed as MCP tools. The agent can then call `agentpod_task_create`, `agentpod_verify`, `agentpod_merge`, etc. directly.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Agent command failed |
| `2` | Verification failed |
| `3` | Merge conflict |
| `4` | Invalid arguments |
| `5` | Workspace error |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)

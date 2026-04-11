<p align="center">
  <h1 align="center">agex</h1>
  <p align="center">
    <strong>Run multiple AI coding agents in parallel — safely.</strong>
  </p>
  <p align="center">
    Each agent gets its own git branch and worktree. Nothing touches main until you say so.
  </p>
  <p align="center">
    For Claude Code, Codex CLI, Copilot CLI, and any agent that runs shell commands.
  </p>
  <p align="center">
    <a href="https://github.com/ruban-24/agex/actions"><img src="https://github.com/ruban-24/agex/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/@ruban24/agex"><img src="https://img.shields.io/npm/v/@ruban24/agex.svg" alt="npm version"></a>
    <a href="https://github.com/ruban-24/agex/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@ruban24/agex.svg" alt="license"></a>
    <a href="https://www.npmjs.com/package/@ruban24/agex"><img src="https://img.shields.io/node/v/@ruban24/agex.svg" alt="node version"></a>
    <a href="https://github.com/ruban-24/agex"><img src="https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  </p>
</p>

<p align="center">
  <img src="./docs/demo.gif" alt="agex demo" width="800">
</p>

---

## Get Started

### Homebrew (macOS/Linux)

```
brew install ruban-24/tap/agex
```

### npm

```bash
npm install -g @ruban24/agex
```

Then initialize in your project:

```bash
cd your-project
agex init
```

Requires **Node.js >= 20** and **git**. `agex init` auto-detects your project, asks a few questions, and drops a skill file so your agent discovers agex automatically. Then just tell your agent:

> *"Use agex to try 3 different approaches to refactor the auth module, then compare and merge the best one."*

## Why agex?

AI coding agents are fast — but they work on your branch, one task at a time.

**What if you could run 5 agents in parallel, each in an isolated workspace, and pick the best result?**

```
1. You run    →  agex init             →  guided setup, drops agent skill files
2. Agent works →  creates tasks in parallel  →  isolated worktrees, auto-verification
3. You decide  →  agex summary --human   →  merge the winner, discard the rest
```

That's the whole model. You run one command. Your agent does the rest. You check in when you want.

**For you:** install, init, go back to what you were doing. Check in when you want with `agex summary --human`.

**For your agent:** commands for every step — create, verify, compare, accept, reject. JSON output by default. Agent skill files for auto-discovery.

**No cloud. No accounts. No team buy-in needed.** Everything lives in `.agex/` (gitignored) and optional skill files (committed).

## When to Reach for agex

- **You want to try multiple approaches and pick the best** — fan out 3 ideas, verify all, merge the winner
- **You have independent subtasks that can run in parallel** — auth, notifications, and rate limiting don't block each other
- **You want to experiment without risking your branch** — every task is an isolated worktree, reject costs nothing
- **You're orchestrating multiple agents on the same codebase** — Claude Code dispatches work to Codex, Aider, or any CLI tool
- **You want automated verification before merging agent output** — tests, lint, and build run automatically

### When NOT to reach for agex

- **Trivial single-file edits** — isolation overhead isn't worth it, just let your agent edit directly
- **Strictly sequential tasks** — if step 2 depends on step 1's output, parallelism can't help
- **Non-git projects** — agex requires git for worktree isolation

## What Does It Look Like?

Add `--human` to any command for colored terminal output:

**Check on all tasks:**
```
$ agex summary --human

agex · 3 tasks
3 tasks · 1 completed · 1 running · 1 failed

┃ ✓  abc123  completed   12.4s  3/3  +47 -12 · 4 files   JWT approach
┃ ▶  def456  running      8.1s                             Sessions approach
┃ ✗  ghi789  failed      15.2s  1/3  +93 -41 · 14 files   OAuth approach
```

**Verify a task's results:**
```
$ agex verify abc123 --human

abc123 · verification

✓ npm test          (4.2s)
✓ npm run lint      (2.1s)
✓ npm run build     (6.1s)

All 3 checks passed (12.4s total)
```

**Review changes:**
```
$ agex review abc123 --human

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

→ Full review: git diff HEAD...agex/abc123
```

**Compare and decide** (once all tasks finish):
```
$ agex compare abc123 def456 ghi789 --human

  ID       Status      Checks  Changes  Duration  Prompt
  ──────────────────────────────────────────────────────────
  abc123   completed   3/3     +47 -12  12.4s     JWT approach
  def456   completed   3/3     +31 -8    9.2s     Sessions approach
  ghi789   failed      1/3     +93 -41  15.2s     OAuth approach
  ──────────────────────────────────────────────────────────
  3 tasks · 2 completed · 1 failed
```

## Supported Agents

`agex init` drops a skill file into your repo so your agent discovers agex automatically. No manual configuration needed — just start your agent and give it a task.

| Agent | Skill file location | Auto-discovered |
|-------|-------------------|-----------------|
| Claude Code | `.claude/skills/agex/SKILL.md` | Yes |
| Codex CLI | `.agents/skills/agex/SKILL.md` | Yes |
| Copilot CLI | `.github/skills/agex/SKILL.md` | Yes |

Any agent that can run shell commands works with agex via subprocess mode (`--cmd`). The skill files above teach agents the full agex workflow — when to use it, how to create tasks, verify, compare, and merge.

## Commands

All commands output JSON by default — designed for agent consumption. Add `--human` for colored terminal output when you're checking in.

### Task Lifecycle

| Command | Description |
|---------|-------------|
| `agex init` | Initialize agex (interactive guided setup) |
| `agex create --prompt "..." [--issue <ref>]` | Create an isolated workspace (from prompt, GitHub issue, or both) |
| `agex exec <id> --cmd "..." [--wait]` | Run a command in a task's worktree |
| `agex run --prompt "..." --cmd "..." [--wait]` | Shortcut for create + exec |
| `agex start <id>` | Start dev server in task worktree |
| `agex stop <id>` | Stop dev server |
| `agex cancel [id]` | Kill a running or needs-input agent task |

### Monitoring

| Command | Description |
|---------|-------------|
| `agex status <id>` | Get detailed task info |
| `agex list` | List all tasks |
| `agex output <id>` | Show captured agent output |
| `agex summary` | Status breakdown of all tasks |

### Review

| Command | Description |
|---------|-------------|
| `agex verify <id>` | Run verification checks |
| `agex review <id>` | Diff stats, commits, per-file changes |
| `agex compare <id1> <id2> ...` | Compare tasks side-by-side |

### Resolution

| Command | Description |
|---------|-------------|
| `agex accept <id>` | Merge task branch into current branch |
| `agex reject <id>` | Remove task worktree and branch |
| `agex retry <id> --feedback "..."` | Retry a failed task with feedback |
| `agex answer <id> --text "..."` | Answer a question from a needs-input task |
| `agex clean` | Clean up all finished tasks |

## Configuration

Create `.agex/config.yml` (or pass `--verify` to `init`):

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

### Monorepos

agex works in monorepos but doesn't auto-detect workspace layouts yet. You'll need to manually configure `.agex/config.yml` to list per-package files:

```yaml
# Example: pnpm monorepo with packages/api and packages/web
copy:
  - .env
  - packages/api/.env
  - packages/web/.env

symlink: []  # avoid symlinking node_modules in monorepos — hoisting makes it fragile

setup:
  - pnpm install  # regenerates all node_modules correctly in the worktree

verify:
  - pnpm run lint
  - pnpm run test
  - pnpm run build
```

**What to know:**

- **Don't symlink `node_modules`** in monorepos. Use `setup: pnpm install` (or `yarn install`) instead — it regenerates dependencies correctly per the workspace layout.
- **List each `.env` explicitly.** Auto-detection only finds the root `.env`, not ones nested in packages.
- **Auto-detection only checks the repo root** for `package.json`, lock files, etc. It won't detect your package manager from `pnpm-workspace.yaml` or the `workspaces` field — set `setup` manually.
- **Worktrees are full repo checkouts.** Each task gets the entire monorepo, not a single package. This is fine — your agent can be told to work on a specific package via the task prompt.

### Auto-Detection

If no `verify` commands are configured, agex auto-detects from your project:

| File | Detected commands |
|------|-------------------|
| `package.json` | `npm test`, `npm run lint`, `npm run build` |
| `Makefile` | `make test` |
| `pyproject.toml` | `pytest` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |

<details>
<summary>Subprocess mode (CI, scripting, multi-agent)</summary>

You can also orchestrate agex directly. This is useful for CI pipelines, shell scripts, and dispatching multiple different agents on the same codebase.

**Key flags:**
- `--prompt "..."` — describes the task (used for tracking and comparison)
- `--cmd "..."` — the command to run inside the isolated worktree (any CLI tool)
- `--wait` — block until the command finishes (without it, the task runs in the background)

```bash
# Fan out 3 different agents on the same task
agex run --prompt "JWT auth (Claude)" \
  --cmd "claude -p 'refactor auth to use JWT'" --wait &
agex run --prompt "JWT auth (Codex)" \
  --cmd "codex -q 'refactor auth to use JWT'" --wait &
agex run --prompt "JWT auth (Copilot)" \
  --cmd "copilot-cli 'refactor auth to use JWT'" --wait &
wait

# Compare all three, accept the best
agex compare $(agex list --json | jq -r '.[].id' | tr '\n' ' ')
agex accept <best-id>
agex clean
```

**Each task gets its own environment variables** — `AGEX_TASK_ID`, `AGEX_WORKTREE`, and `AGEX_PORT` — so parallel processes can bind to different ports without conflicts.

</details>

<details>
<summary>MCP server for native tool discovery</summary>

If your agent or IDE supports Model Context Protocol, you can also expose agex as an MCP server. This is **not required** — skill files are the recommended path.

```json
{
  "mcpServers": {
    "agex": {
      "command": "agex-mcp",
      "args": []
    }
  }
}
```

**Claude Code** — add to `.claude/settings.json` or `~/.claude/settings.json`

**Cursor** — add to `.cursor/mcp.json`

All CLI commands are exposed as MCP tools.

</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)

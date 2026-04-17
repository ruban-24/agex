<p align="center">
  <h1 align="center">agex</h1>
  <p align="center">
    <strong>Stop waiting for your AI agent to finish. Run them all at once.</strong>
  </p>
  <p align="center">
    Each agent gets its own git branch and worktree. Nothing touches main until you say so.
  </p>
  <p align="center">
    <a href="https://github.com/ruban-24/agex/actions"><img src="https://github.com/ruban-24/agex/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/@ruban24/agex"><img src="https://img.shields.io/npm/v/@ruban24/agex.svg" alt="npm version"></a>
    <a href="https://github.com/ruban-24/agex/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@ruban24/agex.svg" alt="license"></a>
    <a href="https://www.npmjs.com/package/@ruban24/agex"><img src="https://img.shields.io/node/v/@ruban24/agex.svg" alt="node version"></a>
    <a href="https://github.com/ruban-24/agex"><img src="https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  </p>
</p>

You ask Claude Code to refactor auth. It works for 10 minutes. You wait. Then you ask it to add notifications. It works for 8 minutes. You wait. Then rate limiting. More waiting.

**What if all three ran at the same time — each on its own branch — and you just picked the results?**

```
$ agex create --prompt "Refactor auth to JWT"
$ agex create --prompt "Add push notifications"
$ agex create --prompt "Add API rate limiting"

# Go get coffee. Come back to:
$ agex summary --human

  agex · 3 tasks · 3 completed

  ┃ ✓  a1b2c3  completed  12.4s  3/3  +47 -12  JWT auth
  ┃ ✓  d4e5f6  completed   9.2s  3/3  +31 -8   Push notifications
  ┃ ✓  g7h8i9  completed  15.1s  3/3  +62 -19  Rate limiting

$ agex accept a1b2c3 d4e5f6 g7h8i9   # merge all three
```

That's agex. Parallel AI agents, isolated branches, nothing touches main until you say so.

Works with **Claude Code**, **Codex CLI**, **Copilot CLI**, and any agent that runs shell commands.

---

## Quick Start

```bash
# Install (pick one)
brew install ruban-24/tap/agex
npm install -g @ruban24/agex

# Start using it immediately — no setup required
cd your-project
agex create --prompt "Add JWT auth with refresh tokens"
agex create --prompt "Add session-based auth with Redis"
```

That's it. `agex create` works in any git repo — no `agex init` needed. It bootstraps the workspace automatically on first use.

Want verification, agent hooks, or provisioning? Run `agex init` to configure them:

```bash
agex init   # auto-detects project, sets up verify commands and agent skill files
```

Then just tell your agent:

> *"Use agex to try 2 different approaches to refactor the auth module, then verify both and merge the best one."*

```bash
# Check in whenever you want
agex summary --human

# Verify, review, and ship the winner
agex verify <id> --human
agex review <id> --human
agex accept <id> --human
```

Requires **Node.js >= 20** and **git**.

## Why agex?

AI coding agents are fast — but they work on your branch, one task at a time. You're serializing work that could be parallel.

**The real cost isn't the agent's time. It's yours — sitting idle while it finishes.**

agex gives each agent its own git worktree and branch. They work simultaneously, can't interfere with each other, and nothing merges until you verify and approve.

**No cloud. No accounts. No team buy-in needed.** Install it, use it. Everything lives locally.

### What about plain git worktrees?

agex uses worktrees under the hood, but handles what raw worktrees don't — environment setup (`.env`, secrets), dependency management (`node_modules` symlinking), port isolation, automated verification, side-by-side comparison, and cleanup.

<table>
<tr>
<td align="center"><strong>Without agex</strong></td>
<td align="center"><strong>With agex</strong></td>
</tr>
<tr>
<td><img src="./docs/without-agex.gif" alt="Without agex — manual worktree management"></td>
<td><img src="./docs/with-agex.gif" alt="With agex — parallel agent tasks"></td>
</tr>
</table>

## Who Is This For?

You already use an AI coding agent and you've hit one of these walls:

- **"I have 4 features to ship and my agent does them one at a time"** — fan them all out in parallel
- **"My agent broke main again"** — every task is isolated, nothing merges until tests pass
- **"I want to try 3 approaches and pick the best"** — verify all three, merge the winner

Not for trivial single-file edits, strictly sequential tasks, or non-git projects.

## Supported Agents

`agex init` drops a skill file into your repo so your agent discovers agex automatically. Or install just the skill file with [`npx skills`](https://github.com/vercel-labs/skills):

```bash
npx skills add ruban-24/agex --skill agex
```

| Agent | Skill file location | Auto-discovered |
|-------|-------------------|-----------------|
| Claude Code | `.claude/skills/agex/SKILL.md` | Yes |
| Codex CLI | `.agents/skills/agex/SKILL.md` | Yes |
| Copilot CLI | `.github/skills/agex/SKILL.md` | Yes |

Any agent that can run shell commands works with agex via subprocess mode (`--cmd`).

> **Real-time activity capture is Claude Code only.** `agex activity <id>` shows per-turn tool calls (Read/Edit/Bash/Grep…) for Claude Code sessions via its hook API. Codex and Copilot tasks still record lifecycle events (create, exec, verify, finish, subagent start/stop), but the per-tool timeline won't be populated.

<details>
<summary><strong>Commands</strong></summary>

All commands output JSON by default — designed for agent consumption. Add `--human` for colored terminal output.

### Task Lifecycle

| Command | Description |
|---------|-------------|
| `agex init` | Configure agex (optional — `create` works without it) |
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
| `agex activity <id> [--human]` | Per-turn timeline of tool calls, subagents, verification, tokens (Claude Code) |

### Review

| Command | Description |
|---------|-------------|
| `agex verify <id>` | Run verification checks |
| `agex review <id>` | Diff stats, commits, per-file changes |
| `agex compare <id1> <id2> ...` | Compare tasks side-by-side |

### Resolution

| Command | Description |
|---------|-------------|
| `agex accept <id> [--reviewed]` | Merge task branch (`--reviewed` required in manual review mode) |
| `agex reject <id>` | Remove task worktree and branch |
| `agex retry <id> --feedback "..."` | Retry a failed task with feedback |
| `agex answer <id> --text "..."` | Answer a question from a needs-input task |
| `agex clean` | Clean up all finished tasks |

</details>

<details>
<summary><strong>Configuration</strong></summary>

Create `.agex/config.yml` (or pass `--verify` to `init`):

```yaml
# Review mode: auto (agent merges on verify pass) or manual (agent asks before merging)
review: manual

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

agex detects monorepos automatically (pnpm, npm/yarn workspaces, Lerna, Nx, Turborepo, Cargo workspaces, Go workspaces). When detected, `agex init` prints setup guidance and creates a template config.

```yaml
# Example: pnpm monorepo
copy:
  - .env
  - packages/api/.env
  - packages/web/.env

symlink: []  # avoid symlinking node_modules in monorepos

setup:
  - pnpm install

verify:
  - pnpm run lint
  - pnpm run test
  - pnpm run build
```

**Tips:** Don't symlink `node_modules` in monorepos — use `setup: pnpm install` instead. List each `.env` explicitly since auto-detection only finds the root one.

### Auto-Detection

If no `verify` commands are configured, agex auto-detects from your project:

| File | Detected commands |
|------|-------------------|
| `package.json` | `npm test`, `npm run lint`, `npm run build` |
| `Makefile` | `make test` |
| `pyproject.toml` | `pytest` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |
| `Package.swift` | `swift build`, `swift test` |
| `project.yml` (XcodeGen) | `xcodegen generate`, `xcodebuild build` |
| `*.xcodeproj` | `xcodebuild build` |
| `.swiftlint.yml` | `swiftlint` |

</details>

<details>
<summary><strong>Subprocess mode (CI, scripting, multi-agent)</strong></summary>

Orchestrate agex directly — useful for CI pipelines, shell scripts, and dispatching multiple different agents on the same codebase.

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
agex accept <best-id> --reviewed
agex clean
```

Each task gets its own environment variables — `AGEX_TASK_ID`, `AGEX_WORKTREE`, and `AGEX_PORT` — so parallel processes can bind to different ports without conflicts.

</details>

<details>
<summary><strong>MCP server</strong></summary>

If your agent or IDE supports Model Context Protocol, you can expose agex as an MCP server. This is **not required** — skill files are the recommended path.

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

</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

If agex saves you time, [star the repo](https://github.com/ruban-24/agex) — it helps others find it.

## License

[MIT](LICENSE)

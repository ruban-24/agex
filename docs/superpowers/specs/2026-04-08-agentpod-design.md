# agentpod — Design Specification

> A CLI runtime for running parallel AI coding tasks safely inside real repos.

## 1. Product Identity & Positioning

**Name:** agentpod

**One-liner:** An agent-first, local-first CLI runtime that treats AI coding tasks as reproducible local jobs — isolate, execute, verify, compare, merge or discard.

**What it is:**
- An agent-agnostic CLI that any AI coding agent can call to get isolated workspaces, run parallel tasks, verify results, and manage the full task lifecycle
- The developer is the PM who steers; agents are the engineers who write code; agentpod is the infrastructure those engineers work on

**What it is NOT:**
- Not a git worktree manager (worktrees are the mechanism, not the product)
- Not an AI agent (it orchestrates execution, doesn't replace agents)
- Not a desktop app (CLI-first, composable, scriptable)
- Not cloud-dependent (fully local, no account needed)
- Not visible to the repo (all state in `.agentpod/`, gitignored, no team buy-in required)

**Target user (MVP):** Solo developer running AI coding agents (Claude Code, Codex CLI, Aider, etc.) in interactive mode. The developer tells their agent to use agentpod — the agent is the primary consumer of the CLI. The developer rarely types agentpod commands directly.

**Competitive position:** The open quadrant in the landscape — CLI runtime with full lifecycle management. Emdash, Mozzie, and Coder Mux are GUI apps. gtr and subtask are partial wrappers. Gas Town is heavyweight orchestration for 20-30 agents. Agentpod is the docker-compose layer: simple, composable infrastructure for 2-10 parallel tasks.

## 2. Design Principles

- **Agent-first:** Agents are the primary CLI consumers. Humans steer agents, agents call agentpod.
- **Seamless provisioning:** A workspace must "just work" — secrets copied, deps installed, ports allocated. The agent should never need to debug a broken worktree. Provisioning patterns are informed by workmux (copy vs symlink) and worktrunk (copy-ignored, hash-based ports, two-phase setup hooks).
- **Multiple use cases:** Supports both trying multiple approaches to one task AND running multiple independent tasks in parallel across the same repo.
- **Invisible to the repo:** No agentpod artifacts in git. No team buy-in needed. Any developer can use it independently.

## 3. Core Workflow

The primary flow:

```
Developer tells their agent (Claude Code, Codex, etc.)
  → "try 3 approaches to refactor auth"
  → Agent calls: agentpod run --prompt "approach 1: JWT" --cmd "claude -p '...'"
  → Agent calls: agentpod run --prompt "approach 2: sessions" --cmd "codex -q '...'"
  → Agent calls: agentpod task create --prompt "approach 3: OAuth"
  → Agent works in the worktree directly for approach 3
  → Agent calls: agentpod verify <id> (for each task)
  → Agent calls: agentpod compare <id1> <id2> <id3>
  → Agent calls: agentpod merge <winning-id>
  → Agent calls: agentpod clean
```

Two execution paths, both in MVP:

| Path | Command | Use case |
|------|---------|----------|
| **Workspace only** | `agentpod task create` | Agent works in the worktree directly using its own tools |
| **Workspace + subprocess** | `agentpod run --cmd "..."` | Agent delegates to a different agent (cross-agent orchestration) |

The subprocess layer is what makes agentpod agent-agnostic. Without it, agentpod only works for the agent that's currently running. With it, Claude Code can dispatch work to Codex, Aider, or any CLI tool.

## 4. Architecture

### 4.1 Approach

Hybrid architecture: CLI-first with JSON state files for MVP, structured so the core TaskManager module can later be wrapped in a daemon or server.

```
MVP:     CLI → TaskManager → git/subprocess → JSON state files
Later:   CLI → HTTP/IPC → Daemon(TaskManager) → git/subprocess → SQLite
```

### 4.2 Internal Modules

```
CLI (commander)
 ├── TaskManager      — create, track, update task state (JSON files)
 ├── WorkspaceManager — git worktree lifecycle (create, provision, cleanup)
 ├── AgentRunner      — spawn agent subprocess, capture exit code & output
 ├── Verifier         — run repo verification commands, collect results
 └── Reviewer         — diff generation, task comparison, merge/discard
```

### 4.3 Data Flow (headless run)

```
agentpod run --prompt "refactor auth" --cmd "claude -p '...'"
  1. TaskManager       → creates task record (pending)
  2. WorkspaceManager  → creates worktree + branch, copies env/config, runs setup hooks (provisioning → ready)
  3. AgentRunner       → spawns agent subprocess in worktree dir (running)
  4. AgentRunner       → agent finishes, exit code + log captured
  5. Verifier          → runs verification commands in worktree (verifying)
  6. TaskManager       → stores results (completed or failed)
```

### 4.4 Data Flow (workspace only)

```
agentpod task create --prompt "refactor auth"
  1. TaskManager       → creates task record (pending)
  2. WorkspaceManager  → creates worktree + branch, copies env/config, runs setup hooks (provisioning → ready)
  3. Returns worktree path — agent works in it using its own tools
  4. Agent calls: agentpod verify <id> when done
  5. Verifier          → runs verification commands (verifying → completed/failed)
```

### 4.5 File Structure

All local, all gitignored. Invisible to the repo and team.

```
.agentpod/
  config.yml              # repo-level: verify commands, env files to copy, defaults
  tasks/
    abc123.json           # task state record
    abc123.log            # captured agent output (headless mode)
  worktrees/
    abc123/               # git worktree (isolated copy of repo)
```

## 5. CLI Interface

### 5.1 Design Principles

- **Agent-first:** All output is JSON by default. Add `--human` or `-h` for pretty output.
- **Non-interactive:** No confirmations, no prompts, ever.
- **Non-blocking by default:** `agentpod run` and `agentpod task exec` return immediately with a running status. The calling agent launches multiple tasks in parallel, then polls with `agentpod task status`. Use `--wait` flag to block until completion (useful for scripting or when running a single task).
- **Granular exit codes:** Agents branch on failure type.
- **Composable:** Each command does one thing. `run` is a convenience shortcut combining `task create` + `task exec`.

### 5.2 Commands

**Setup (human does this once per repo):**

```bash
agentpod init
agentpod init --verify "npm test" --verify "npm run lint"
```

Creates `.agentpod/` directory and adds it to `.gitignore`. If `.gitignore` doesn't exist, creates one.

**Task creation and execution:**

```bash
# Create workspace only (agent works in it directly)
agentpod task create --prompt "refactor auth to use JWT"
# → {"id":"abc123","status":"ready","branch":"agentpod/abc123","worktree":".agentpod/worktrees/abc123","env":{"AGENTPOD_TASK_ID":"abc123","AGENTPOD_WORKTREE":"/path/.agentpod/worktrees/abc123","AGENTPOD_PORT_OFFSET":"3100"}}

# Execute a command inside an existing task's worktree
agentpod task exec abc123 --cmd "codex -q 'refactor auth to use JWT'"
# → {"id":"abc123","status":"running","pid":12345}

# Create + exec in one shot (convenience)
agentpod run --prompt "refactor auth" --cmd "claude -p 'refactor auth to use JWT'"
# → {"id":"abc123","status":"running","pid":12345}
```

**Monitoring:**

```bash
# List all tasks
agentpod list
# → [{"id":"abc123","prompt":"refactor auth","status":"completed","passed":true,"files_changed":4},...]

# Detailed status for one task
agentpod task status abc123
# → {"id":"abc123","status":"completed","exit_code":0,"duration_s":133,"verification":{...},"diff_stats":{...}}

# Stream captured agent output
agentpod log abc123
# → (raw log output)
```

**Verification:**

```bash
agentpod verify abc123
# → {"id":"abc123","checks":[{"cmd":"npm test","passed":true,"exit_code":0,"duration_s":8},{"cmd":"npm run lint","passed":true,"exit_code":0,"duration_s":3}]}
```

**Review and compare:**

```bash
# Diff of what agent changed
agentpod diff abc123
# → {"id":"abc123","files_changed":4,"insertions":52,"deletions":31,"diff":"..."}

# Compare multiple tasks
agentpod compare abc123 def456
# → {"tasks":[{"id":"abc123","checks_passed":3,"files_changed":4},{"id":"def456","checks_passed":2,"files_changed":12}]}

# Summary of all tasks
agentpod summary
# → {"total":3,"completed":2,"failed":1,"tasks":[...]}
```

**Merge and cleanup:**

```bash
# Merge winning branch into original branch (fast-forward if possible, merge commit otherwise)
# Use --strategy=cherry-pick to cherry-pick instead of merge
agentpod merge abc123
# → {"id":"abc123","merged_to":"main","commit":"e4f5g6h","strategy":"fast-forward"}

# Discard a task (removes worktree + branch)
agentpod discard def456
# → {"id":"def456","status":"discarded","cleaned":true}

# Clean all completed/discarded task worktrees
agentpod clean
# → {"removed":["def456","ghi789"],"kept":["abc123"]}
```

**Human-friendly mode:**

```bash
agentpod list --human
# ┌──────────┬───────────┬────────┬─────────┬───────────────┐
# │ ID       │ Status    │ Agent  │ Checks  │ Files Changed │
# ├──────────┼───────────┼────────┼─────────┼───────────────┤
# │ abc123   │ completed │ claude │ 3/3 pass│ 4             │
# │ def456   │ failed    │ codex  │ 2/3 fail│ 12            │
# └──────────┴───────────┴────────┴─────────┴───────────────┘
```

### 5.3 Exit Codes

```
0 = success
1 = agent command failed (non-zero exit from subprocess)
2 = verification failed (one or more checks failed)
3 = merge conflict
4 = invalid task ID or arguments
5 = workspace error (git worktree creation/removal failure)
```

## 6. Repo Configuration

### 6.1 Config File

```yaml
# .agentpod/config.yml — local only, never pushed to remote

# Commands to verify agent work (run in order, fail-fast)
# If omitted, agentpod auto-detects from repo (see 5.2)
verify:
  - npm test
  - npm run lint
  - npm run build

# Workspace provisioning — three strategies for getting files into worktrees:

# copy: duplicates the file (use for secrets, local config — each worktree gets its own copy)
copy:
  - .env
  - .env.local

# symlink: symlinks to main worktree's copy (use for large dirs to save disk + setup time)
symlink:
  - node_modules
  - .next/cache

# copy_ignored: bulk-copy ALL gitignored files from main worktree
# Useful when you don't know exactly what local files the app needs
# Explicit copy/symlink entries take precedence over copy_ignored
copy_ignored:
  enabled: false
  exclude:
    - .cache/
    - tmp/

# Setup hooks — two phases (inspired by workmux/worktrunk patterns)
# setup: blocking — runs before workspace is marked ready (deps, builds)
# setup_background: non-blocking — runs after ready (dev servers, watchers)
setup:
  - npm install
setup_background: []

# Port isolation
ports:
  base: 3000
  offset: 100       # task 1 → 3100, task 2 → 3200, etc.

# Default agent command (used when --cmd is omitted)
# --cmd flag overrides this entirely
defaults:
  cmd: "claude -p"

# Max concurrent tasks
concurrency: 5

# Timeout for agent subprocess (seconds, 0 = no timeout)
timeout: 0
```

### 6.2 Verification Auto-Detection

When no `verify` commands are configured, agentpod inspects the repo:

| File detected | Commands inferred |
|---|---|
| `package.json` with `test` script | `npm test` |
| `package.json` with `lint` script | `npm run lint` |
| `package.json` with `build` script | `npm run build` |
| `Makefile` with `test` target | `make test` |
| `pyproject.toml` | `pytest` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |

Config `verify` overrides auto-detection entirely.

### 6.3 Injected Environment Variables

Every task worktree gets these environment variables:

```
AGENTPOD_TASK_ID=abc123
AGENTPOD_WORKTREE=/absolute/path/.agentpod/worktrees/abc123
AGENTPOD_PORT_OFFSET=3100
```

### 6.4 Repo Invisibility

- `agentpod init` adds `.agentpod/` to `.gitignore` automatically
- If `.gitignore` doesn't exist, creates one with `.agentpod/`
- No agentpod files are ever committed or pushed
- Multiple developers can use agentpod independently on the same repo
- No team buy-in required

## 7. Task Lifecycle

### 7.1 State Machine

```
pending → provisioning → ready → running → verifying → completed
                                                      → failed
                                    ↓
                                  errored

completed/failed → merged
                 → discarded
```

- `pending`: task record created, workspace not yet set up
- `provisioning`: worktree being created, setup hooks running
- `ready`: workspace prepared, waiting for agent (workspace-only path stays here until `verify` or `task exec`)
- `running`: agent subprocess active (headless path only)
- `verifying`: verification commands executing
- `completed`: all checks passed
- `failed`: one or more checks failed
- `errored`: agent process crashed, timed out, or was killed
- `merged`: branch merged into original branch, worktree cleaned up
- `discarded`: worktree and branch deleted

### 7.2 State Transitions

| Transition | Triggered by | What happens |
|---|---|---|
| `pending → provisioning` | `task create` or `run` | Worktree + branch created, env copied, setup hooks run |
| `provisioning → ready` | agentpod (automatic) | Workspace prepared |
| `ready → running` | `task exec` or `run` | Agent subprocess spawned |
| `running → verifying` | agentpod (agent process exits) | Verification commands start regardless of agent exit code — let verification determine if the work is usable |
| `running → errored` | agentpod (agent crashes, timeout exceeded, or killed by signal) | Error details recorded, no verification run |
| `verifying → completed` | agentpod (all checks pass) | Results stored |
| `verifying → failed` | agentpod (any check fails) | Failure details stored |
| `ready → verifying` | `verify` command | Direct verification (workspace-only path) |
| `completed/failed → merged` | `merge` command | Branch merged, worktree removed |
| `completed/failed → discarded` | `discard` command | Worktree + branch deleted |

### 7.3 Task Record

```json
{
  "id": "abc123",
  "prompt": "refactor auth to use JWT",
  "cmd": "claude -p 'refactor auth to use JWT'",
  "status": "completed",
  "branch": "agentpod/abc123",
  "worktree": ".agentpod/worktrees/abc123",
  "created_at": "2026-04-08T10:30:00Z",
  "started_at": "2026-04-08T10:30:02Z",
  "finished_at": "2026-04-08T10:32:15Z",
  "duration_s": 133,
  "pid": 12345,
  "exit_code": 0,
  "env": {
    "AGENTPOD_TASK_ID": "abc123",
    "AGENTPOD_WORKTREE": "/path/.agentpod/worktrees/abc123",
    "AGENTPOD_PORT_OFFSET": "3100"
  },
  "verification": {
    "passed": true,
    "checks": [
      {"cmd": "npm test", "passed": true, "exit_code": 0, "duration_s": 8},
      {"cmd": "npm run lint", "passed": true, "exit_code": 0, "duration_s": 3},
      {"cmd": "npm run build", "passed": true, "exit_code": 0, "duration_s": 12}
    ]
  },
  "diff_stats": {
    "files_changed": 4,
    "insertions": 52,
    "deletions": 31
  }
}
```

## 8. Technology Stack (MVP)

| Component | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Fastest to build, npm distribution, ecosystem (simple-git, execa, commander) |
| Distribution | npm (`npx agentpod`) | Zero-friction install |
| Git operations | `simple-git` | Mature, well-maintained Node.js git wrapper |
| Subprocess management | `execa` | Modern subprocess library, good streaming and error handling |
| CLI framework | `commander` | Lightweight, widely used |
| State storage | JSON files | Human-readable, debuggable, no dependencies |
| Configuration | YAML (`js-yaml`) | Familiar to developers, readable |

## 9. MCP Server

Ship alongside the CLI in v1. Exposes agentpod commands as MCP tools so agents discover it natively.

**MCP tools exposed:**

| Tool | Maps to |
|---|---|
| `agentpod_task_create` | `agentpod task create` |
| `agentpod_run` | `agentpod run` |
| `agentpod_task_status` | `agentpod task status` |
| `agentpod_verify` | `agentpod verify` |
| `agentpod_diff` | `agentpod diff` |
| `agentpod_compare` | `agentpod compare` |
| `agentpod_list` | `agentpod list` |
| `agentpod_merge` | `agentpod merge` |
| `agentpod_discard` | `agentpod discard` |
| `agentpod_clean` | `agentpod clean` |
| `agentpod_summary` | `agentpod summary` |

The MCP server wraps the same internal modules as the CLI — no duplication of logic. This ensures agents that discover agentpod via MCP get the same behavior as agents calling the CLI directly.

## 10. What agentpod Does NOT Manage

- Docker containers, VMs, or any heavy isolation — just git worktrees
- Secrets management — `.env` is copied as-is, user's responsibility
- Agent credentials — agents bring their own API keys
- Remote state — everything stays local
- Agent-specific configuration — agents configure themselves
- Work tracking / issue management — that's the agent's job (or Beads, Jira, Linear, etc.)

## 11. Roadmap

### v1 — MVP

- `agentpod init` — repo setup with gitignore
- `agentpod task create` — workspace creation and provisioning
- `agentpod run` — workspace + subprocess execution
- `agentpod task exec` — run command in existing workspace
- `agentpod task status` / `agentpod list` — monitoring
- `agentpod log` — captured agent output
- `agentpod verify` — run verification with auto-detection
- `agentpod diff` / `agentpod compare` / `agentpod summary` — review
- `agentpod merge` / `agentpod discard` / `agentpod clean` — merge and cleanup
- MCP server — agent discovery
- JSON-first output, `--human` flag for pretty output
- Repo configuration (`.agentpod/config.yml`)
- Port isolation via environment variables

### v2 — Adoption

- Cost/token tracking per task
- GitHub/GitLab PR creation (`agentpod pr <id>`)
- Task templates (reusable definitions)
- Conflict detection (warn when parallel tasks modify same files)
- `agentpod task cancel` — kill running subprocess

### v3 — Commercial Layer

- Remote execution — cloud sandboxes (`agentpod run --remote`)
- Cost optimization — detect and skip redundant work
- Team visibility — shared dashboard
- Audit logging
- RBAC

### v4 — Platform

- Marketplace for verification policies and environment templates
- Federation across repos/teams
- Enterprise SSO and compliance features

## 12. Competitive Landscape Summary

| Tool | Type | Scope | agentpod's differentiation |
|---|---|---|---|
| Emdash (3.7k stars, YC) | Desktop app | Full lifecycle, GUI | CLI runtime, agent-first, no GUI dependency |
| Coder Mux (1.6k stars, AGPL) | Desktop + browser | Parallel agents | MIT license, CLI-first, lighter weight |
| Agent of Empires (1.5k stars) | TUI/tmux | Session management | Full lifecycle, not just session management |
| Gas Town (13k stars) | Orchestration platform | 20-30 agents, heavyweight | Simple, focused, solo dev, zero operational overhead |
| gtr / CodeRabbit (1.5k stars) | CLI worktree helper | Worktree creation only | Full lifecycle beyond worktree management |
| worktrunk (4.2k stars) | CLI worktree manager | Worktree UX + setup hooks | Agent-first runtime, not a worktree manager; verification, comparison, subprocess orchestration |
| workmux (1.2k stars) | CLI worktree + tmux | Worktree + terminal windows | Same as worktrunk; agentpod is infrastructure for agents, not a developer-facing worktree tool |
| Mozzie (45 stars) | Desktop app (Tauri) | Similar vision | CLI-first, agent-first, composable |
| Claude Code Agent Teams | Built-in, experimental | Parallel agents | Agent-agnostic, worktree isolation, standalone |
| Codex CLI sandbox | Built-in | Single-agent safety | Multi-agent, parallel execution |

**Positioning:** agentpod is the docker-compose of AI coding tasks — the composable, agent-first infrastructure layer between lightweight worktree wrappers (gtr) and heavyweight orchestration platforms (Gas Town).

## 13. Key Risks

| Risk | Mitigation |
|---|---|
| Claude Code / Codex ship robust built-in parallel task support | Agent-agnostic design — agentpod works with any CLI agent, not locked to one platform |
| Emdash adds a CLI/SDK layer | agentpod is open source, MIT licensed, no lock-in — community trust is the moat |
| Space is crowded, hard to get adoption | MCP server for frictionless discovery; agent-first design means the tool spreads through agent usage, not marketing |
| Git worktree limitations (shared index.lock, limited nested repo support) | Document known limitations clearly; these are git constraints, not agentpod's |

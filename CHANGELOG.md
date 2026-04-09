# Changelog

## 0.1.0 — 2026-04-09

Initial release.

### Features

- **Task lifecycle**: create, execute, verify, diff, compare, merge, discard, clean
- **Isolated workspaces** via git worktrees with automatic branch management
- **Blocking and non-blocking execution** with background lifecycle completion
- **Verification system** with configurable check commands and auto-detection (package.json, Makefile, pyproject.toml, Cargo.toml, go.mod)
- **Workspace provisioning**: file copy, symlink, setup hooks
- **Port isolation** via `AGENTPOD_PORT_OFFSET` environment variable
- **Diff and compare**: stats, commit log, per-file changes, side-by-side comparison
- **Merge with conflict detection**: fast-forward or merge commit, worktree restored on conflict
- **JSON output by default** (agent-first), `--human` flag for colored terminal output
- **MCP server** exposing all 14 commands as tools
- **Task state machine** with enforced valid transitions

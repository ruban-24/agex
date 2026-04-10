# Changelog

## 0.1.0 — 2026-04-10

Initial public release.

### Features

- **Task lifecycle**: create, execute, verify, diff, compare, merge, discard, clean
- **Isolated workspaces** via git worktrees with automatic branch management
- **Blocking and non-blocking execution** with background lifecycle completion
- **Verification system** with configurable check commands and auto-detection (package.json, Makefile, pyproject.toml, Cargo.toml, go.mod)
- **Workspace provisioning**: file copy, symlink, setup hooks
- **Port isolation** via `AGEX_PORT` environment variable
- **Diff and compare**: stats, commit log, per-file changes, side-by-side comparison
- **Merge with conflict detection**: fast-forward or merge commit, worktree restored on conflict
- **Auto-commit uncommitted worktree changes** on merge, warn on discard/clean
- **Auto-infer task ID** from cwd when running inside a worktree
- **Interactive init** with guided setup and agent skill file generation
- **JSON output by default** (agent-first), `--human` flag for colored terminal output
- **MCP server** exposing all 14 commands as tools
- **Task state machine** with enforced valid transitions
- **Agent skill files** for Claude Code, Codex CLI, and Copilot CLI auto-discovery

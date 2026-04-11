# Contributing to agex

## Development Setup

```bash
git clone https://github.com/ruban-24/agex.git
cd agex
npm install
```

## Scripts

```bash
npm run build      # Build the project
npm run dev        # Run CLI via tsx (no build needed)
npm test           # Run tests with vitest
npm run test:watch # Watch mode
npm run lint       # Typecheck with tsc --noEmit
```

## Running locally without building

```bash
npx tsx src/index.ts --help
npx tsx src/index.ts init
npx tsx src/index.ts create --prompt "test"
```

## Project Structure

```
src/
  index.ts              # CLI entry point (commander)
  types.ts              # Shared types
  constants.ts          # Paths, exit codes, defaults
  config/               # YAML config loading, auto-detection
  core/                 # TaskManager, WorkspaceManager, AgentRunner, Verifier, Reviewer
  cli/
    commands/           # One file per command
    format/             # Human-readable output formatters
    output.ts           # JSON/human output helpers
  mcp/                  # MCP server and tool definitions
tests/                  # Mirrors src/ structure
```

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run lint && npm test` to verify
4. Open a pull request

## Tests

Tests use [vitest](https://vitest.dev/) and create temporary git repos for isolation. Each test suite cleans up its own worktrees and temp directories.

Run a specific test file:

```bash
npx vitest run tests/core/task-manager.test.ts
```

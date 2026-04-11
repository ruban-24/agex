## agex

This repo uses agex for worktree-isolated task management.

**All non-trivial work MUST go through `agex create`.** NEVER edit code files directly on main unless it is a single-file trivial fix (typo, config tweak, one-line change).

If you are about to edit more than one file, STOP — create an agex task first. No exceptions, no rationalizing ("the files overlap", "it's easier sequentially", "I'll just do it quickly"). Those are exactly the cases where isolation prevents mistakes.

When multiple parts of the work are independent, create separate agex tasks and work them in parallel.

**Always use the `agex` CLI package** (not `node dist/index.js`) when dogfooding agex commands. Running from `dist/` can cause conflicts with the build output of the tasks you're merging.

## Codex Review

Run `/codex:review` at two checkpoints:
1. **After writing the implementation plan** — before any code is written
2. **After all code is written** — before merging the worktree to main

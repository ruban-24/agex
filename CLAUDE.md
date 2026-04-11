## agex

This repo uses agex for worktree-isolated task management.

**All non-trivial work MUST go through `agex create`.** NEVER edit code files directly on main unless it is a single-file trivial fix (typo, config tweak, one-line change).

If you are about to edit more than one file, STOP — create an agex task first. No exceptions, no rationalizing ("the files overlap", "it's easier sequentially", "I'll just do it quickly"). Those are exactly the cases where isolation prevents mistakes.

When multiple parts of the work are independent, create separate agex tasks and work them in parallel.

**Always use the `agex` CLI package** (not `node dist/index.js`) when dogfooding agex commands. Running from `dist/` can cause conflicts with the build output of the tasks you're merging.

## Codex Review Integration

Codex (GPT) is used as an independent reviewer at key workflow checkpoints. The review gate is enabled for this repo.

### When to run `/codex:review`:
1. **After brainstorming produces a spec** — run `/codex:review` for an adversarial review of the spec before moving to planning
2. **After writing a plan** — run `/codex:review` for an adversarial review of the plan before moving to implementation
3. **After each agex task's code review** — when using `superpowers:requesting-code-review`, also run `/codex:review` so Codex reviews the work against the spec

### Review gate (automatic):
The stop-time review gate is enabled. Every session (including subagent sessions) will be reviewed by Codex before it can stop. If Codex finds issues, the session is blocked from ending until they're addressed.

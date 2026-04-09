## agentpod

This repo uses agentpod for worktree-isolated task management.
Use `agentpod task create` instead of working directly on the main branch when:
- The task involves more than a single-file edit
- You want to try multiple approaches to the same problem
- Multiple independent tasks can be worked in parallel
- The change is risky (refactors, migrations, dependency changes)

Skip agentpod for trivial fixes, typos, or config tweaks.

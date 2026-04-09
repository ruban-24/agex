import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export type AgentId = 'claude-code' | 'codex' | 'copilot';

export const VALID_AGENT_IDS: AgentId[] = ['claude-code', 'codex', 'copilot'];

export const AGENT_LABELS: Record<AgentId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex CLI',
  'copilot': 'Copilot CLI',
};

export const AGENT_PATHS: Record<AgentId, string> = {
  'claude-code': '.claude/skills/agentpod/SKILL.md',
  'codex': '.agents/skills/agentpod/SKILL.md',
  'copilot': '.github/skills/agentpod/SKILL.md',
};

// Instruction files that agents read at session start (CLAUDE.md = when, SKILL.md = how)
export const AGENT_INSTRUCTION_FILES: Record<AgentId, string> = {
  'claude-code': 'CLAUDE.md',
  'codex': 'AGENTS.md',
  'copilot': 'AGENTS.md',
};

const INSTRUCTION_BLOCK = `
## agentpod

This repo uses agentpod for worktree-isolated task management.
Use \`agentpod task create\` instead of working directly on the main branch when:
- The task involves more than a single-file edit
- You want to try multiple approaches to the same problem
- Multiple independent tasks can be worked in parallel
- The change is risky (refactors, migrations, dependency changes)

Skip agentpod for trivial fixes, typos, or config tweaks.
`;

// Inlined from skills/agentpod/SKILL.md — update both when content changes.
export const SKILL_CONTENT = `---
name: agentpod
description: Use when working in a git repository and needing to try multiple approaches, isolate risky changes in safe worktrees, or verify and compare results before merging. You are the agent — create tasks, work inside their worktrees, then verify and merge.
---

# agentpod

You have access to \`agentpod\`, a CLI tool for managing isolated git worktrees. Each task gets its own branch and worktree directory. Nothing touches the main branch until you explicitly merge.

**You are the agent.** Create tasks, \`cd\` into their worktree paths, do your work there (edit files, run commands), then verify and merge back.

## When to Use

- The user asks you to try multiple approaches — create a task per approach, work each one, compare
- The user asks for a risky change (refactor, migration) — isolate it in a task
- The user asks for independent subtasks — fan them out into separate tasks
- You want to verify your work (tests, lint, build) before merging

**When NOT to use:** Trivial single-file edits, non-git projects.

## Workflow

### Step 1: Create a task

\`\`\`bash
agentpod task create --prompt "Implement caching using Redis"
\`\`\`

This returns JSON with \`id\` and \`worktree\` (the directory path).

### Step 2: Work inside the worktree

\`cd\` into the worktree path and do your work there — edit files, run commands, install packages. This is a full copy of the repo on its own git branch.

\`\`\`bash
cd <worktree-path>
# Now edit files, run tests, etc. — all isolated from main
\`\`\`

### Step 3: Verify

\`\`\`bash
agentpod verify <id>
\`\`\`

Runs the configured verification commands (tests, lint, build). Check the output — if anything fails, fix it in the worktree and re-verify.

### Step 4: Review and merge

\`\`\`bash
agentpod diff <id>         # See what changed
agentpod merge <id>        # Merge into current branch
agentpod clean             # Remove finished task worktrees
\`\`\`

## Multiple Approaches

When the user wants you to explore alternatives:

\`\`\`bash
# Create one task per approach
agentpod task create --prompt "Approach A: use Redis"
agentpod task create --prompt "Approach B: use in-memory LRU"

# Work on each — cd into each worktree and implement
# Then verify both
agentpod verify <id1>
agentpod verify <id2>

# Compare them
agentpod compare <id1> <id2>

# Present results to the user, merge the winner
agentpod merge <winner-id>
agentpod discard <loser-id>
agentpod clean
\`\`\`

## When Things Fail

\`\`\`bash
agentpod diff <id>           # See what you changed
agentpod discard <id>        # Throw it away
# Create a new task and try again with a different approach
\`\`\`

## Command Reference

| Command | Purpose |
|---------|---------|
| \`agentpod task create --prompt <text>\` | Create isolated task — returns \`id\` and \`worktree\` path |
| \`agentpod task status <id>\` | Get task details |
| \`agentpod list\` | List all tasks |
| \`agentpod verify <id>\` | Run verification checks (tests, lint, build) |
| \`agentpod diff <id>\` | Show changes vs base branch |
| \`agentpod compare <id1> <id2> [...]\` | Side-by-side task comparison |
| \`agentpod merge <id>\` | Merge task branch into current branch |
| \`agentpod discard <id>\` | Remove task worktree and branch |
| \`agentpod clean\` | Clean up all finished tasks |

All commands output JSON — parse the output to get task IDs, worktree paths, and status.

## Key Details

- \`task create\` returns \`{ "id": "...", "worktree": "/path/to/worktree", ... }\` — use the \`worktree\` path to \`cd\` into
- Always \`verify\` before \`merge\`
- Always \`compare\` when you have multiple tasks
- Always \`clean\` after merging/discarding
- Merge conflicts auto-abort and preserve the worktree so you can fix and retry
- \`cd\` back to the original repo directory before running \`merge\` or other agentpod commands
`;

/**
 * Write the agentpod SKILL.md file and append instructions to the agent's
 * instruction file (CLAUDE.md / AGENTS.md) for each selected agent.
 * Creates parent directories as needed.
 * Returns the array of relative paths that were written or modified.
 */
export async function writeSkillFiles(
  repoRoot: string,
  agents: AgentId[],
): Promise<string[]> {
  const written: string[] = [];
  const updatedInstructionFiles = new Set<string>();

  for (const agent of agents) {
    // Write SKILL.md
    const relPath = AGENT_PATHS[agent];
    const absPath = join(repoRoot, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, SKILL_CONTENT, 'utf-8');
    written.push(relPath);

    // Append to instruction file (CLAUDE.md / AGENTS.md) — once per file
    const instrFile = AGENT_INSTRUCTION_FILES[agent];
    if (updatedInstructionFiles.has(instrFile)) continue;
    updatedInstructionFiles.add(instrFile);

    const instrPath = join(repoRoot, instrFile);
    let existing = '';
    try {
      existing = await readFile(instrPath, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    if (!existing.includes('## agentpod')) {
      const content = existing.trimEnd() + '\n' + INSTRUCTION_BLOCK;
      await writeFile(instrPath, content, 'utf-8');
      written.push(instrFile);
    }
  }

  return written;
}

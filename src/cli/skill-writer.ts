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
  'claude-code': '.claude/skills/agex/SKILL.md',
  'codex': '.agents/skills/agex/SKILL.md',
  'copilot': '.github/skills/agex/SKILL.md',
};

// Instruction files that agents read at session start (CLAUDE.md = when, SKILL.md = how)
export const AGENT_INSTRUCTION_FILES: Record<AgentId, string> = {
  'claude-code': 'CLAUDE.md',
  'codex': 'AGENTS.md',
  'copilot': 'AGENTS.md',
};

const INSTRUCTION_BLOCK = `
## agex

This repo uses agex for worktree-isolated task management.

**All non-trivial work MUST go through \`agex task create\`.** NEVER edit code files directly on main unless it is a single-file trivial fix (typo, config tweak, one-line change).

If you are about to edit more than one file, STOP — create an agex task first. No exceptions, no rationalizing ("the files overlap", "it's easier sequentially", "I'll just do it quickly"). Those are exactly the cases where isolation prevents mistakes.

When multiple parts of the work are independent, create separate agex tasks and work them in parallel.
`;

// Compact version of skills/agex/SKILL.md — written by `agex init` into agent skill directories.
export const SKILL_CONTENT = `---
name: agex
description: Use when a task involves changes to multiple files, multiple independent subtasks, or anything beyond a trivial single-file edit in a git repository. Creates isolated worktrees so work doesn't touch main until verified and merged.
---

# agex

**All non-trivial work goes through agex.** If you are about to edit files directly on main and the change touches more than one file, stop — create an agex task first.

You have access to \`agex\`, a CLI tool for managing isolated git worktrees. Each task gets its own branch and worktree directory. Nothing touches the main branch until you explicitly merge.

**You are the agent.** Create tasks, \`cd\` into their worktree paths, do your work there (edit files, run commands), then verify and merge back.

## When to Use

- The task has 2+ independent parts that touch different files — create a task per part
- The change modifies more than one file — isolate it
- The change is risky (refactor, migration, dependency change) — isolate it
- You want to verify before merging (tests, lint, build)

**Only skip agex for:** single-file trivial fixes (typos, config tweaks, one-line changes), or non-git projects.

## Workflow

### Step 1: Create a task

\`\`\`bash
agex task create --prompt "Implement caching using Redis"
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
agex verify <id>
\`\`\`

Runs the configured verification commands (tests, lint, build). Check the output — if anything fails, fix it in the worktree and re-verify.

### Step 4: Review and merge

\`\`\`bash
agex diff <id>         # See what changed
agex merge <id>        # Merge into current branch
agex clean             # Remove finished task worktrees
\`\`\`

## Multiple Approaches

When the user wants you to explore alternatives:

\`\`\`bash
# Create one task per approach
agex task create --prompt "Approach A: use Redis"
agex task create --prompt "Approach B: use in-memory LRU"

# Work on each — cd into each worktree and implement
# Then verify both
agex verify <id1>
agex verify <id2>

# Compare them
agex compare <id1> <id2>

# Present results to the user, merge the winner
agex merge <winner-id>
agex discard <loser-id>
agex clean
\`\`\`

## When Things Fail

\`\`\`bash
agex log <id>              # See what went wrong
agex retry <id> --feedback "Fix X because Y"  # Retry with context
# Or if the approach is fundamentally wrong:
agex discard <id>          # Throw it away and start fresh
\`\`\`

## When You're Stuck

If you need a human decision before continuing:

1. Write \`.agex/needs-input.json\` in your worktree:
   \`{"question": "JWT or sessions?", "options": ["jwt", "sessions"]}\`
2. Exit — agex pauses the task
3. Human responds with \`agex respond <id> --answer "jwt"\`
4. You're re-invoked with the answer in your prompt

## Command Reference

| Command | Purpose |
|---------|---------|
| \`agex task create --prompt <text>\` | Create isolated task — returns \`id\` and \`worktree\` path |
| \`agex task status <id>\` | Get task details |
| \`agex list\` | List all tasks |
| \`agex verify <id>\` | Run verification checks (tests, lint, build) |
| \`agex diff <id>\` | Show changes vs base branch |
| \`agex compare <id1> <id2> [...]\` | Side-by-side task comparison |
| \`agex merge <id>\` | Merge task branch into current branch |
| \`agex discard <id>\` | Remove task worktree and branch |
| \`agex clean\` | Clean up all finished tasks |
| \`agex retry <id> --feedback <text>\` | Retry failed task with enhanced prompt |
| \`agex respond <id> --answer <text>\` | Answer a task's question and resume |

All commands output JSON — parse the output to get task IDs, worktree paths, and status.

## Task Lifecycle

\`\`\`
pending -> provisioning -> ready -> running -> verifying -> completed -> merged
                                            -> needs-input -> running (after respond)
                                               verifying -> failed -> retried (after retry)
\`\`\`

## Key Details

- \`task create\` returns \`{ "id": "...", "worktree": "/path/to/worktree", ... }\` — use the \`worktree\` path to \`cd\` into
- Always \`verify\` before \`merge\`
- Always \`compare\` when you have multiple tasks
- Always \`clean\` after merging/discarding
- Merge conflicts auto-abort and preserve the worktree so you can fix and retry
- \`cd\` back to the original repo directory before running \`merge\` or other agex commands
- Run individual tests directly during development, but use \`agex verify\` for final validation — it runs all checks and records results
`;

/**
 * Write the agex SKILL.md file and append instructions to the agent's
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

    if (!existing.includes('## agex')) {
      const content = existing.trimEnd() + '\n' + INSTRUCTION_BLOCK;
      await writeFile(instrPath, content, 'utf-8');
      written.push(instrFile);
    }
  }

  return written;
}

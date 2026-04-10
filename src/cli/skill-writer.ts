import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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

**All non-trivial work MUST go through \`agex create\`.** NEVER edit code files directly on main unless it is a single-file trivial fix (typo, config tweak, one-line change).

If you are about to edit more than one file, STOP — create an agex task first. No exceptions, no rationalizing ("the files overlap", "it's easier sequentially", "I'll just do it quickly"). Those are exactly the cases where isolation prevents mistakes.

When multiple parts of the work are independent, create separate agex tasks and work them in parallel.
`;

// Single source of truth: skills/agex/SKILL.md — read at runtime.
// Try two relative paths: dev (src/cli/) and prod (dist/).
let _skillContent: string;
try {
  _skillContent = readFileSync(new URL('../../skills/agex/SKILL.md', import.meta.url), 'utf-8');
} catch {
  _skillContent = readFileSync(new URL('../skills/agex/SKILL.md', import.meta.url), 'utf-8');
}
export const SKILL_CONTENT: string = _skillContent;

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

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

// Hook config file paths per agent
const AGENT_HOOK_CONFIG_PATHS: Record<AgentId, string> = {
  'claude-code': '.claude/settings.json',
  'codex': '.codex/hooks.json',
  'copilot': '.github/hooks/hooks.json',
};

// Hook content file paths per agent
const AGENT_HOOK_FILE_PATHS: Record<AgentId, string> = {
  'claude-code': '.claude/hooks/agex-gate.md',
  'codex': '.codex/hooks/agex-gate.md',
  'copilot': '.github/hooks/agex-gate.md',
};

// SessionStart hook content — the "agex gate" injected at conversation start
export const HOOK_CONTENT = `AGEX GATE — Read this before doing anything.

Before editing ANY file, ask yourself:
1. Is this a single-file trivial fix (typo, config tweak, one-line change)? → Edit directly on main.
2. Everything else? → Run \`agex create --prompt "..."\` first, cd into the worktree, work there.

Do NOT use raw git worktrees or built-in worktree isolation tools. This repo uses agex for all worktree isolation.
Do NOT run tests/lint/build manually — use \`agex verify <id>\` as the final gate.
Invoke the \`agex\` skill for full workflow and command reference.
`;

/**
 * Build the hook config JSON for a given agent, merging into existing config if present.
 */
function buildHookConfig(agent: AgentId, hookFilePath: string, existing: Record<string, unknown> | null): Record<string, unknown> {
  const hookCommand = `cat ${hookFilePath}`;

  switch (agent) {
    case 'claude-code': {
      const config = existing ?? {};
      const hooks = (config.hooks as Record<string, unknown[]>) ?? {};
      const sessionStart = (hooks.SessionStart as unknown[]) ?? [];

      // Check if we already have an agex hook
      const hasAgexHook = sessionStart.some((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        const innerHooks = e.hooks as Array<Record<string, unknown>> | undefined;
        return innerHooks?.some(h => typeof h.command === 'string' && h.command.includes('agex-gate'));
      });

      if (!hasAgexHook) {
        sessionStart.push({
          hooks: [{
            type: 'command',
            command: hookCommand,
            timeout: 5,
          }],
        });
      }

      return { ...config, hooks: { ...hooks, SessionStart: sessionStart } };
    }

    case 'codex': {
      const config = existing ?? {};
      const hooks = (config.hooks as Record<string, unknown[]>) ?? {};
      const sessionStart = (hooks.SessionStart as unknown[]) ?? [];

      const hasAgexHook = sessionStart.some((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        const innerHooks = e.hooks as Array<Record<string, unknown>> | undefined;
        return innerHooks?.some(h => typeof h.command === 'string' && h.command.includes('agex-gate'));
      });

      if (!hasAgexHook) {
        sessionStart.push({
          hooks: [{
            type: 'command',
            command: hookCommand,
          }],
        });
      }

      return { ...config, hooks: { ...hooks, SessionStart: sessionStart } };
    }

    case 'copilot': {
      const config = existing ?? { version: 1 };
      const hooks = (config.hooks as Record<string, unknown[]>) ?? {};
      const sessionStart = (hooks.sessionStart as unknown[]) ?? [];

      const hasAgexHook = sessionStart.some((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        return typeof e.bash === 'string' && e.bash.includes('agex-gate');
      });

      if (!hasAgexHook) {
        sessionStart.push({
          type: 'command',
          bash: hookCommand,
          timeoutSec: 5,
        });
      }

      // Copilot uses lowercase sessionStart
      return { ...config, hooks: { ...hooks, sessionStart: sessionStart } };
    }
  }
}

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
 * Write the agex SKILL.md file and configure a SessionStart hook
 * for each selected agent. Creates parent directories as needed.
 * Returns the array of relative paths that were written or modified.
 */
export async function writeSkillFiles(
  repoRoot: string,
  agents: AgentId[],
): Promise<string[]> {
  const written: string[] = [];

  for (const agent of agents) {
    // Write SKILL.md
    const relPath = AGENT_PATHS[agent];
    const absPath = join(repoRoot, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, SKILL_CONTENT, 'utf-8');
    written.push(relPath);

    // Write hook content file
    const hookFileRel = AGENT_HOOK_FILE_PATHS[agent];
    const hookFileAbs = join(repoRoot, hookFileRel);
    await mkdir(dirname(hookFileAbs), { recursive: true });
    await writeFile(hookFileAbs, HOOK_CONTENT, 'utf-8');
    written.push(hookFileRel);

    // Write or merge hook config
    const configRel = AGENT_HOOK_CONFIG_PATHS[agent];
    const configAbs = join(repoRoot, configRel);
    await mkdir(dirname(configAbs), { recursive: true });

    let existing: Record<string, unknown> | null = null;
    try {
      const raw = await readFile(configAbs, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      // File doesn't exist or isn't valid JSON
    }

    const config = buildHookConfig(agent, hookFileRel, existing);
    await writeFile(configAbs, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    written.push(configRel);
  }

  return written;
}

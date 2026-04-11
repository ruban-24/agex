import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AGENT_PATHS,
  getSkillContent,
  HOOK_CONTENT,
  writeSkillFiles,
} from '../../src/cli/skill-writer.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('AGENT_PATHS', () => {
  it('maps claude-code to .claude/skills/agex/SKILL.md', () => {
    expect(AGENT_PATHS['claude-code']).toBe('.claude/skills/agex/SKILL.md');
  });

  it('maps codex to .agents/skills/agex/SKILL.md', () => {
    expect(AGENT_PATHS['codex']).toBe('.agents/skills/agex/SKILL.md');
  });

  it('maps copilot to .github/skills/agex/SKILL.md', () => {
    expect(AGENT_PATHS['copilot']).toBe('.github/skills/agex/SKILL.md');
  });
});

describe('getSkillContent', () => {
  it('contains the agex skill frontmatter', () => {
    expect(getSkillContent()).toContain('name: agex');
  });

  it('contains the workflow section', () => {
    expect(getSkillContent()).toContain('## Core Workflows');
  });

  it('contains retry command reference', () => {
    expect(getSkillContent()).toContain('agex retry');
  });

  it('contains answer command reference', () => {
    expect(getSkillContent()).toContain('agex answer');
  });

  it('contains needs-input workflow section', () => {
    expect(getSkillContent()).toContain('needs-input.json');
  });

  it('contains updated lifecycle with needs-input', () => {
    expect(getSkillContent()).toContain('needs-input');
  });
});

describe('HOOK_CONTENT', () => {
  it('contains the agex gate header', () => {
    expect(HOOK_CONTENT).toContain('AGEX GATE');
  });

  it('references agex create', () => {
    expect(HOOK_CONTENT).toContain('agex create');
  });

  it('references agex verify', () => {
    expect(HOOK_CONTENT).toContain('agex verify');
  });

  it('warns against raw worktrees', () => {
    expect(HOOK_CONTENT).toContain('Do NOT use raw git worktrees');
  });
});

describe('writeSkillFiles', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('writes skill file, hook file, and settings.local.json for claude-code', async () => {
    const written = await writeSkillFiles(repo.path, ['claude-code']);

    expect(written).toContain('.claude/skills/agex/SKILL.md');
    expect(written).toContain('.claude/hooks/agex-gate.md');
    expect(written).toContain('.claude/settings.local.json');

    const skill = await readFile(join(repo.path, '.claude/skills/agex/SKILL.md'), 'utf-8');
    expect(skill).toBe(getSkillContent());

    const hook = await readFile(join(repo.path, '.claude/hooks/agex-gate.md'), 'utf-8');
    expect(hook).toBe(HOOK_CONTENT);

    const settings = JSON.parse(await readFile(join(repo.path, '.claude/settings.local.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].type).toBe('command');
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain('agex-gate');
  });

  it('writes hook config for codex with correct structure', async () => {
    const written = await writeSkillFiles(repo.path, ['codex']);

    expect(written).toContain('.agents/skills/agex/SKILL.md');
    expect(written).toContain('.codex/hooks/agex-gate.md');
    expect(written).toContain('.codex/hooks.json');

    const config = JSON.parse(await readFile(join(repo.path, '.codex/hooks.json'), 'utf-8'));
    expect(config.hooks.SessionStart).toHaveLength(1);
    expect(config.hooks.SessionStart[0].hooks[0].command).toContain('agex-gate');
  });

  it('writes hook config for copilot with version, bash field, and jq wrapper', async () => {
    const written = await writeSkillFiles(repo.path, ['copilot']);

    expect(written).toContain('.github/skills/agex/SKILL.md');
    expect(written).toContain('.github/hooks/agex-gate.md');
    expect(written).toContain('.github/hooks/hooks.json');

    const config = JSON.parse(await readFile(join(repo.path, '.github/hooks/hooks.json'), 'utf-8'));
    expect(config.version).toBe(1);
    expect(config.hooks.sessionStart).toHaveLength(1);
    expect(config.hooks.sessionStart[0].type).toBe('command');
    // Copilot requires JSON with additionalContext — uses jq to wrap the file
    expect(config.hooks.sessionStart[0].bash).toContain('jq');
    expect(config.hooks.sessionStart[0].bash).toContain('additionalContext');
    expect(config.hooks.sessionStart[0].bash).toContain('agex-gate');
  });

  it('writes skill files for multiple agents', async () => {
    const written = await writeSkillFiles(repo.path, ['claude-code', 'codex', 'copilot']);

    expect(written).toContain('.claude/skills/agex/SKILL.md');
    expect(written).toContain('.agents/skills/agex/SKILL.md');
    expect(written).toContain('.github/skills/agex/SKILL.md');
    expect(written).toContain('.claude/settings.local.json');
    expect(written).toContain('.codex/hooks.json');
    expect(written).toContain('.github/hooks/hooks.json');
  });

  it('returns empty array when no agents selected', async () => {
    const written = await writeSkillFiles(repo.path, []);
    expect(written).toEqual([]);
  });

  it('creates parent directories as needed', async () => {
    const written = await writeSkillFiles(repo.path, ['codex']);

    expect(written).toContain('.agents/skills/agex/SKILL.md');
    const skill = await readFile(join(repo.path, '.agents/skills/agex/SKILL.md'), 'utf-8');
    expect(skill).toBe(getSkillContent());
  });

  it('does not duplicate agex hook when run twice', async () => {
    await writeSkillFiles(repo.path, ['claude-code']);
    await writeSkillFiles(repo.path, ['claude-code']);

    const settings = JSON.parse(await readFile(join(repo.path, '.claude/settings.local.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('merges into existing settings.local.json without overwriting other hooks', async () => {
    const { writeFile: wf } = await import('node:fs/promises');
    const { mkdir: mk } = await import('node:fs/promises');
    await mk(join(repo.path, '.claude'), { recursive: true });
    await wf(join(repo.path, '.claude/settings.local.json'), JSON.stringify({
      permissions: { allow: ['Bash(git:*)'] },
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'echo pre' }] }],
      },
    }, null, 2));

    await writeSkillFiles(repo.path, ['claude-code']);

    const settings = JSON.parse(await readFile(join(repo.path, '.claude/settings.local.json'), 'utf-8'));
    // Existing hooks preserved
    expect(settings.permissions.allow).toContain('Bash(git:*)');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    // New hook added
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('does not write CLAUDE.md or AGENTS.md', async () => {
    await writeSkillFiles(repo.path, ['claude-code', 'codex', 'copilot']);

    // No instruction files should be created
    await expect(readFile(join(repo.path, 'CLAUDE.md'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(repo.path, 'AGENTS.md'), 'utf-8')).rejects.toThrow();
  });
});

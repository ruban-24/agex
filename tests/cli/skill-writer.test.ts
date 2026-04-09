import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AGENT_PATHS,
  SKILL_CONTENT,
  writeSkillFiles,
} from '../../src/cli/skill-writer.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('AGENT_PATHS', () => {
  it('maps claude-code to .claude/skills/agentpod/SKILL.md', () => {
    expect(AGENT_PATHS['claude-code']).toBe('.claude/skills/agentpod/SKILL.md');
  });

  it('maps codex to .agents/skills/agentpod/SKILL.md', () => {
    expect(AGENT_PATHS['codex']).toBe('.agents/skills/agentpod/SKILL.md');
  });

  it('maps copilot to .github/skills/agentpod/SKILL.md', () => {
    expect(AGENT_PATHS['copilot']).toBe('.github/skills/agentpod/SKILL.md');
  });
});

describe('SKILL_CONTENT', () => {
  it('contains the agentpod skill frontmatter', () => {
    expect(SKILL_CONTENT).toContain('name: agentpod');
  });

  it('contains the workflow section', () => {
    expect(SKILL_CONTENT).toContain('## Workflow');
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

  it('writes skill file and instruction file for claude-code', async () => {
    const written = await writeSkillFiles(repo.path, ['claude-code']);

    expect(written).toContain('.claude/skills/agentpod/SKILL.md');
    expect(written).toContain('CLAUDE.md');

    const skill = await readFile(join(repo.path, '.claude/skills/agentpod/SKILL.md'), 'utf-8');
    expect(skill).toBe(SKILL_CONTENT);

    const instructions = await readFile(join(repo.path, 'CLAUDE.md'), 'utf-8');
    expect(instructions).toContain('## agentpod');
    expect(instructions).toContain('agentpod task create');
  });

  it('writes skill files for multiple agents with shared AGENTS.md', async () => {
    const written = await writeSkillFiles(repo.path, ['claude-code', 'codex', 'copilot']);

    expect(written).toContain('.claude/skills/agentpod/SKILL.md');
    expect(written).toContain('.agents/skills/agentpod/SKILL.md');
    expect(written).toContain('.github/skills/agentpod/SKILL.md');
    expect(written).toContain('CLAUDE.md');
    expect(written).toContain('AGENTS.md');

    // codex and copilot share AGENTS.md — should only appear once
    expect(written.filter(f => f === 'AGENTS.md')).toHaveLength(1);
  });

  it('returns empty array when no agents selected', async () => {
    const written = await writeSkillFiles(repo.path, []);
    expect(written).toEqual([]);
  });

  it('creates parent directories as needed', async () => {
    const written = await writeSkillFiles(repo.path, ['codex']);

    expect(written).toContain('.agents/skills/agentpod/SKILL.md');
    expect(written).toContain('AGENTS.md');

    const skill = await readFile(join(repo.path, '.agents/skills/agentpod/SKILL.md'), 'utf-8');
    expect(skill).toBe(SKILL_CONTENT);
  });

  it('does not duplicate agentpod block if already present', async () => {
    await writeSkillFiles(repo.path, ['claude-code']);
    await writeSkillFiles(repo.path, ['claude-code']);

    const instructions = await readFile(join(repo.path, 'CLAUDE.md'), 'utf-8');
    const matches = instructions.match(/## agentpod/g);
    expect(matches).toHaveLength(1);
  });

  it('appends to existing instruction file without overwriting', async () => {
    const existing = '# My Project\n\nSome existing instructions.\n';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(join(repo.path, 'CLAUDE.md'), existing);

    await writeSkillFiles(repo.path, ['claude-code']);

    const content = await readFile(join(repo.path, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('## agentpod');
  });
});

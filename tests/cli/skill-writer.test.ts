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

  it('contains the overview section', () => {
    expect(SKILL_CONTENT).toContain('## Overview');
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

  it('writes skill file for claude-code with correct content', async () => {
    const written = await writeSkillFiles(repo.path, ['claude-code']);

    expect(written).toEqual(['.claude/skills/agentpod/SKILL.md']);

    const content = await readFile(
      join(repo.path, '.claude/skills/agentpod/SKILL.md'),
      'utf-8',
    );
    expect(content).toBe(SKILL_CONTENT);
  });

  it('writes skill files for multiple agents', async () => {
    const written = await writeSkillFiles(repo.path, ['claude-code', 'codex', 'copilot']);

    expect(written).toEqual([
      '.claude/skills/agentpod/SKILL.md',
      '.agents/skills/agentpod/SKILL.md',
      '.github/skills/agentpod/SKILL.md',
    ]);

    for (const relPath of written) {
      const content = await readFile(join(repo.path, relPath), 'utf-8');
      expect(content).toBe(SKILL_CONTENT);
    }
  });

  it('returns empty array when no agents selected', async () => {
    const written = await writeSkillFiles(repo.path, []);
    expect(written).toEqual([]);
  });

  it('creates parent directories as needed', async () => {
    const written = await writeSkillFiles(repo.path, ['codex']);

    expect(written).toEqual(['.agents/skills/agentpod/SKILL.md']);

    const content = await readFile(
      join(repo.path, '.agents/skills/agentpod/SKILL.md'),
      'utf-8',
    );
    expect(content).toBe(SKILL_CONTENT);
  });
});

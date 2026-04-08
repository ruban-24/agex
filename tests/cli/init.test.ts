import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { initCommand } from '../../src/cli/commands/init.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('initCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('creates .agentpod directory with tasks and worktrees subdirs', async () => {
    await initCommand(repo.path, {});

    await access(join(repo.path, '.agentpod'));
    await access(join(repo.path, '.agentpod', 'tasks'));
    await access(join(repo.path, '.agentpod', 'worktrees'));
  });

  it('adds .agentpod/ to .gitignore', async () => {
    await initCommand(repo.path, {});

    const gitignore = await readFile(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.agentpod/');
  });

  it('creates .gitignore if it does not exist', async () => {
    // Remove existing .gitignore if any
    try {
      await rm(join(repo.path, '.gitignore'));
    } catch {
      // Fine
    }

    await initCommand(repo.path, {});

    const gitignore = await readFile(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.agentpod/');
  });

  it('does not duplicate .agentpod/ in .gitignore on re-init', async () => {
    await initCommand(repo.path, {});
    await initCommand(repo.path, {});

    const gitignore = await readFile(join(repo.path, '.gitignore'), 'utf-8');
    const matches = gitignore.match(/\.agentpod\//g);
    expect(matches).toHaveLength(1);
  });

  it('creates config.yml with verify commands when --verify provided', async () => {
    await initCommand(repo.path, { verify: ['npm test', 'npm run lint'] });

    const config = await readFile(join(repo.path, '.agentpod', 'config.yml'), 'utf-8');
    expect(config).toContain('npm test');
    expect(config).toContain('npm run lint');
  });
});

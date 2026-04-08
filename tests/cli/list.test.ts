import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { listCommand } from '../../src/cli/commands/list.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('listCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('returns empty array when no tasks exist', async () => {
    const result = await listCommand(repo.path);
    expect(result).toEqual([]);
  });

  it('returns all tasks with summary info', async () => {
    await taskCreateCommand(repo.path, { prompt: 'task 1' });
    await taskCreateCommand(repo.path, { prompt: 'task 2' });

    const result = await listCommand(repo.path);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('prompt');
    expect(result[0]).toHaveProperty('status');
  });
});

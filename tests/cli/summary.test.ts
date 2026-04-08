import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { summaryCommand } from '../../src/cli/commands/summary.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('summaryCommand', () => {
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

  it('returns a summary of all tasks', async () => {
    await taskCreateCommand(repo.path, { prompt: 'task 1' });
    await taskCreateCommand(repo.path, { prompt: 'task 2' });

    const result = await summaryCommand(repo.path);

    expect(result.total).toBe(2);
    expect(result.tasks).toHaveLength(2);
  });

  it('counts tasks by status', async () => {
    const result = await summaryCommand(repo.path);

    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

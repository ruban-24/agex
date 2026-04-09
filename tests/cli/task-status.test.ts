import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskStatusCommand } from '../../src/cli/commands/task-status.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('taskStatusCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    const { execSync } = await import('node:child_process');
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

  it('returns the task record for an existing task', async () => {
    const created = await taskCreateCommand(repo.path, {
      prompt: 'fix the login bug',
    });

    const result = await taskStatusCommand(repo.path, created.id);

    expect(result.id).toBe(created.id);
    expect(result.status).toBe('ready');
    expect(result.prompt).toBe('fix the login bug');
    expect(result.branch).toBe(created.branch);
    expect(result.env.AGENTPOD_TASK_ID).toBe(created.id);
  });

  it('includes port, url, and server_running in output', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'status test' });
    const result = await taskStatusCommand(repo.path, task.id);

    const port = parseInt(task.env.AGENTPOD_PORT, 10);
    expect(result.port).toBe(port);
    expect(result.url).toBe(`http://localhost:${port}`);
    expect(result.server_running).toBe(false);
    expect(result.server_pid).toBeUndefined();
  });

  it('throws an error for a non-existent task', async () => {
    await expect(
      taskStatusCommand(repo.path, 'nonexist')
    ).rejects.toThrow('Task not found: nonexist');
  });
});

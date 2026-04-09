import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { taskStopCommand } from '../../src/cli/commands/task-stop.js';
import { taskStartCommand } from '../../src/cli/commands/task-start.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('taskStopCommand', () => {
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

  it('throws when no server is running', async () => {
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'sleep 60' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    await expect(taskStopCommand(repo.path, task.id)).rejects.toThrow(
      /No server running/
    );
  });

  it('stops a running server', async () => {
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'sleep 60' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    const startResult = await taskStartCommand(repo.path, task.id);

    const result = await taskStopCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.server_running).toBe(false);

    // Verify the process is actually dead
    let alive = true;
    try { process.kill(startResult.server_pid, 0); } catch { alive = false; }
    expect(alive).toBe(false);

    // Verify server_pid cleared from task record
    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(updated!.server_pid).toBeUndefined();
  });
});

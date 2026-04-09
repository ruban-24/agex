import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { cleanCommand } from '../../src/cli/commands/clean.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('cleanCommand', () => {
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

  it('returns empty arrays when nothing to clean', async () => {
    const result = await cleanCommand(repo.path);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([]);
  });

  it('removes task JSON files for cleaned tasks', async () => {
    const { TaskManager } = await import('../../src/core/task-manager.js');

    const task = await taskCreateCommand(repo.path, { prompt: 'clean me' });
    const tm = new TaskManager(repo.path);

    // Force task to completed (cleanable status)
    const taskData = await tm.getTask(task.id);
    taskData!.status = 'completed' as any;
    await tm.saveTask(taskData!);

    await cleanCommand(repo.path);

    const result = await tm.getTask(task.id);
    expect(result).toBeNull();
  });

  it('auto-kills server before cleaning task', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { dump } = await import('js-yaml');
    const { taskStartCommand } = await import('../../src/cli/commands/task-start.js');
    const { ServerManager } = await import('../../src/core/server-manager.js');
    const { TaskManager } = await import('../../src/core/task-manager.js');

    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'sleep 60' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'server clean test' });
    const startResult = await taskStartCommand(repo.path, task.id);

    // Force task to completed status so clean picks it up
    const tm = new TaskManager(repo.path);
    const taskData = await tm.getTask(task.id);
    taskData!.status = 'completed' as any;
    await tm.saveTask(taskData!);

    const sm = new ServerManager(repo.path);
    expect(sm.isProcessAlive(startResult.server_pid)).toBe(true);

    const result = await cleanCommand(repo.path);
    expect(result.removed).toContain(task.id);

    // Server should be dead
    expect(sm.isProcessAlive(startResult.server_pid)).toBe(false);
  });
});

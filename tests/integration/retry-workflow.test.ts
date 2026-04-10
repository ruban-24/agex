import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { retryCommand } from '../../src/cli/commands/retry.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('retry workflow integration', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    // Configure verify to run a script that checks for a file
    await writeFile(
      join(repo.path, '.agex', 'config.yml'),
      'verify:\n  - "test -f result.txt"\n'
    );
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
        execSync(`git worktree remove --force "${wt}"`, { cwd: repo.path, stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    await repo.cleanup();
  });

  it('full cycle: create → fail → retry → succeed', async () => {
    const tm = new TaskManager(repo.path);

    // Step 1: Create and run task that fails (doesn't create result.txt)
    const task = await taskCreateCommand(repo.path, { prompt: 'create result file' });
    const failed = await taskExecCommand(repo.path, task.id, {
      cmd: 'echo "oops, forgot to create the file"',
      wait: true,
    });

    const failedTask = await tm.getTask(task.id);
    expect(failedTask!.status).toBe('failed');

    // Step 2: Retry with feedback — this time create the file
    const retried = await retryCommand(repo.path, task.id, {
      feedback: 'You need to create result.txt',
      cmd: 'echo "done" > result.txt',
      wait: true,
    });

    // Original should be retried
    const original = await tm.getTask(task.id);
    expect(original!.status).toBe('retried');

    // New task should be completed
    const newTask = await tm.getTask(retried.id);
    expect(newTask!.status).toBe('completed');
    expect(newTask!.retriedFrom).toBe(task.id);
    expect(newTask!.retryDepth).toBe(1);
  });
});

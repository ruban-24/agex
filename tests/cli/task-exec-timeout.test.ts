import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('task-exec timeout', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    await writeFile(join(repo.path, '.agex', 'config.yml'), 'verify:\n  - "true"\n');
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

  it('completes normally when within timeout (blocking)', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'fast task' });

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: 'echo done',
      wait: true,
      timeout: 30,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(updated!.status).toBe('completed');
  }, 30000);
});

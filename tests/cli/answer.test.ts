import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { answerCommand } from '../../src/cli/commands/answer.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('answerCommand', () => {
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

  it('rejects respond on task not in needs-input state', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });

    await expect(
      answerCommand(repo.path, task.id, { text: 'jwt', cmd: 'echo ok' })
    ).rejects.toThrow(/needs-input/i);
  });

  it('appends QA pair to responses and clears needsInput', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    const tm = new TaskManager(repo.path);

    // Force to needs-input state
    const taskData = await tm.getTask(task.id);
    taskData!.status = 'needs-input' as any;
    taskData!.needsInput = { question: 'Use JWT or sessions?' };
    taskData!.cmd = 'echo "working"';
    await tm.saveTask(taskData!);

    const result = await answerCommand(repo.path, task.id, {
      text: 'jwt',
      cmd: 'echo "continuing"',
      wait: true,
    });

    const updated = await tm.getTask(task.id);
    expect(updated!.responses).toHaveLength(1);
    expect(updated!.responses![0].question).toBe('Use JWT or sessions?');
    expect(updated!.responses![0].answer).toBe('jwt');
    expect(updated!.responses![0].round).toBe(1);
    expect(updated!.needsInput).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { respondCommand } from '../../src/cli/commands/respond.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('needs-input workflow integration', () => {
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

  it('full cycle: create → needs-input → respond → complete', async () => {
    const tm = new TaskManager(repo.path);

    // Step 1: Create and run task that asks a question
    const task = await taskCreateCommand(repo.path, { prompt: 'implement auth' });
    await taskExecCommand(repo.path, task.id, {
      cmd: 'mkdir -p .agex && echo \'{"question":"Use JWT or sessions?","options":["jwt","sessions"]}\' > .agex/needs-input.json',
      wait: true,
    });

    const paused = await tm.getTask(task.id);
    expect(paused!.status).toBe('needs-input');
    expect(paused!.needsInput!.question).toBe('Use JWT or sessions?');

    // Step 2: Respond — agent completes successfully this time
    await respondCommand(repo.path, task.id, {
      answer: 'jwt',
      cmd: 'echo "using jwt"',
      wait: true,
    });

    const completed = await tm.getTask(task.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.responses).toHaveLength(1);
    expect(completed!.responses![0].answer).toBe('jwt');
    expect(completed!.needsInput).toBeUndefined();
  });
});

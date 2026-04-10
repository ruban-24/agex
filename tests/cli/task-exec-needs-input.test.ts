import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('needs-input detection', () => {
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

  it('transitions to needs-input when agent writes needs-input.json', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test task' });
    const wtPath = join(repo.path, task.worktree);

    const agentCmd = `mkdir -p .agex && echo '{"question":"Use JWT or sessions?","options":["jwt","sessions"]}' > .agex/needs-input.json`;

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: agentCmd,
      wait: true,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(updated!.status).toBe('needs-input');
    expect(updated!.needsInput).toBeDefined();
    expect(updated!.needsInput!.question).toBe('Use JWT or sessions?');
    expect(updated!.needsInput!.options).toEqual(['jwt', 'sessions']);
  });

  it('proceeds to verify when no needs-input.json exists', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test task' });

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: 'echo "doing work"',
      wait: true,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(updated!.status).toBe('completed');
    expect(updated!.needsInput).toBeUndefined();
  });

  it('proceeds to verify when needs-input.json is malformed', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test task' });

    const agentCmd = `mkdir -p .agex && echo '{"notaquestion":"bad"}' > .agex/needs-input.json`;

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: agentCmd,
      wait: true,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(['completed', 'failed']).toContain(updated!.status);
  });
});

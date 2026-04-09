import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareCommand } from '../../src/cli/commands/compare.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('compareCommand', () => {
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

  it('compares multiple tasks', async () => {
    const task1 = await taskCreateCommand(repo.path, { prompt: 'approach 1' });
    const task2 = await taskCreateCommand(repo.path, { prompt: 'approach 2' });

    const result = await compareCommand(repo.path, [task1.id, task2.id]);

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].id).toBe(task1.id);
    expect(result.tasks[1].id).toBe(task2.id);
  });

  it('includes duration and diff stats in comparison', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'enriched compare' });
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'file.ts'), 'export const x = 1;\n');
    execSync('git add . && git commit -m "add file"', { cwd: wtPath, stdio: 'ignore' });

    const result = await compareCommand(repo.path, [task.id]);

    expect(result.tasks[0]).toHaveProperty('duration_s');
    expect(result.tasks[0]).toHaveProperty('insertions');
    expect(result.tasks[0]).toHaveProperty('deletions');
    expect(result.tasks[0].insertions).toBeGreaterThan(0);
  });
});

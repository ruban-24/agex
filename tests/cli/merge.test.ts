import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { mergeCommand } from '../../src/cli/commands/merge.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('mergeCommand', () => {
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

  it('merges a task branch and cleans up the worktree', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'merge test' });

    // Make a change in the worktree
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'merged.ts'), 'export const merged = true;\n');
    execSync('git add . && git commit -m "add merged file"', { cwd: wtPath, stdio: 'ignore' });

    const result = await mergeCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.merged).toBe(true);

    // Verify the file exists on the main branch
    await access(join(repo.path, 'merged.ts'));

    // Verify worktree is removed
    await expect(access(wtPath)).rejects.toThrow();
  });

  it('restores worktree when merge fails due to conflict', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'conflict test' });
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);

    // Make a change in the worktree on README.md (exists from initial commit)
    await writeFile(join(wtPath, 'README.md'), '# Modified by task\n');
    execSync('git add . && git commit -m "task modifies readme"', { cwd: wtPath, stdio: 'ignore' });

    // Make a conflicting change on main
    await writeFile(join(repo.path, 'README.md'), '# Modified on main\n');
    execSync('git add . && git commit -m "main modifies readme"', { cwd: repo.path, stdio: 'ignore' });

    const result = await mergeCommand(repo.path, task.id);

    expect(result.merged).toBe(false);
    // Worktree should be restored
    await access(wtPath);
  });
});

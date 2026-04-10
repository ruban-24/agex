import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { mergeCommand } from '../../src/cli/commands/merge.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('mergeCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
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
    const wtPath = join(repo.path, '.agex', 'tasks', task.id);
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

  it('auto-commits uncommitted changes before merging', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'auto-commit test' });

    // Make a change in the worktree but do NOT commit
    const wtPath = join(repo.path, '.agex', 'tasks', task.id);
    await writeFile(join(wtPath, 'uncommitted.ts'), 'export const uncommitted = true;\n');

    const result = await mergeCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.merged).toBe(true);
    expect(result.auto_committed).toBe(true);

    // Verify the file exists on main
    await access(join(repo.path, 'uncommitted.ts'));

    // Verify commit message is the task prompt
    const log = execSync('git log -1 --format=%s', { cwd: repo.path, encoding: 'utf-8' }).trim();
    expect(log).toBe('auto-commit test');
  });

  it('does not set auto_committed when changes were already committed', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'pre-committed test' });

    const wtPath = join(repo.path, '.agex', 'tasks', task.id);
    await writeFile(join(wtPath, 'committed.ts'), 'export const committed = true;\n');
    execSync('git add . && git commit -m "manual commit"', { cwd: wtPath, stdio: 'ignore' });

    const result = await mergeCommand(repo.path, task.id);

    expect(result.merged).toBe(true);
    expect(result.auto_committed).toBeUndefined();
  });

  it('rejects merge when working tree is dirty', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'dirty merge test' });

    // Make a commit in the worktree so there's something to merge
    const wtPath = join(repo.path, '.agex', 'tasks', task.id);
    await writeFile(join(wtPath, 'new-file.txt'), 'content');
    execSync('git add . && git commit -m "add file"', { cwd: wtPath, stdio: 'ignore' });

    // Dirty the main working tree
    await writeFile(join(repo.path, 'dirty.txt'), 'uncommitted');

    await expect(mergeCommand(repo.path, task.id)).rejects.toThrow('uncommitted changes');

    // Clean up
    const { unlink } = await import('node:fs/promises');
    await unlink(join(repo.path, 'dirty.txt'));
  });

  it('restores worktree when merge fails due to conflict', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'conflict test' });
    const wtPath = join(repo.path, '.agex', 'tasks', task.id);

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

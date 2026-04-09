import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { diffCommand } from '../../src/cli/commands/diff.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('diffCommand', () => {
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

  it('returns diff info for a task', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'diff test' });

    // Make a change in the worktree
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'newfile.ts'), 'export const x = 1;\n');
    execSync('git add . && git commit -m "add file"', { cwd: wtPath, stdio: 'ignore' });

    const result = await diffCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.files_changed).toBe(1);
  });

  it('includes commit log in result', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'commits test' });
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'file.ts'), 'export const y = 1;\n');
    execSync('git add . && git commit -m "test commit"', { cwd: wtPath, stdio: 'ignore' });

    const result = await diffCommand(repo.path, task.id);
    expect(result.commits).toBeDefined();
    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
  });

  it('includes per-file stats in result', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'files test' });
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'stats.ts'), 'export const z = 1;\n');
    execSync('git add . && git commit -m "add stats file"', { cwd: wtPath, stdio: 'ignore' });

    const result = await diffCommand(repo.path, task.id);
    expect(result.files).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });
});

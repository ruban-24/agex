import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { WorkspaceManager } from '../../src/core/workspace-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('WorkspaceManager', () => {
  let repo: TestRepo;
  let wm: WorkspaceManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    wm = new WorkspaceManager(repo.path);
  });

  afterEach(async () => {
    // Clean up worktrees before removing the repo
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
      // Ignore cleanup errors
    }
    await repo.cleanup();
  });

  describe('createWorktree', () => {
    it('creates a git worktree at the expected path', async () => {
      const taskId = 'abc123';
      const branch = 'agentpod/abc123';
      const worktreePath = join(repo.path, '.agentpod', 'worktrees', taskId);

      await wm.createWorktree(taskId, branch);

      await access(worktreePath);
      // Verify the README from the initial commit exists in the worktree
      const readme = await readFile(join(worktreePath, 'README.md'), 'utf-8');
      expect(readme).toBe('# Test Repo\n');
    });

    it('creates a new branch for the worktree', async () => {
      const taskId = 'abc123';
      const branch = 'agentpod/abc123';

      await wm.createWorktree(taskId, branch);

      const branches = execSync('git branch', { cwd: repo.path, encoding: 'utf-8' });
      expect(branches).toContain(branch);
    });
  });

  describe('removeWorktree', () => {
    it('removes the worktree and deletes the branch', async () => {
      const taskId = 'abc123';
      const branch = 'agentpod/abc123';

      await wm.createWorktree(taskId, branch);
      await wm.removeWorktree(taskId, branch);

      const worktreePath = join(repo.path, '.agentpod', 'worktrees', taskId);
      await expect(access(worktreePath)).rejects.toThrow();
    });
  });
});

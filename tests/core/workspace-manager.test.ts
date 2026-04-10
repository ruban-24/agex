import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { WorkspaceManager } from '../../src/core/workspace-manager.js';
import { worktreePath } from '../../src/constants.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('WorkspaceManager', () => {
  let repo: TestRepo;
  let wm: WorkspaceManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
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
      const branch = 'agex/abc123';
      const worktreePath = join(repo.path, '.agex', 'tasks', taskId);

      await wm.createWorktree(taskId, branch);

      await access(worktreePath);
      // Verify the README from the initial commit exists in the worktree
      const readme = await readFile(join(worktreePath, 'README.md'), 'utf-8');
      expect(readme).toBe('# Test Repo\n');
    });

    it('creates a new branch for the worktree', async () => {
      const taskId = 'abc123';
      const branch = 'agex/abc123';

      await wm.createWorktree(taskId, branch);

      const branches = execSync('git branch', { cwd: repo.path, encoding: 'utf-8' });
      expect(branches).toContain(branch);
    });
  });

  describe('removeWorktree', () => {
    it('removes the worktree and deletes the branch', async () => {
      const taskId = 'abc123';
      const branch = 'agex/abc123';

      await wm.createWorktree(taskId, branch);
      await wm.removeWorktree(taskId, branch);

      const worktreePath = join(repo.path, '.agex', 'tasks', taskId);
      await expect(access(worktreePath)).rejects.toThrow();
    });
  });

  describe('provision', () => {
    it('copies specified files into the worktree', async () => {
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(join(repo.path, '.env'), 'SECRET=abc123\n');

      const taskId = 'prov01';
      const branch = 'agex/prov01';
      await wm.createWorktree(taskId, branch);

      await wm.provision(taskId, { copy: ['.env'] });

      const wtPath = join(repo.path, '.agex', 'tasks', taskId);
      const envContent = await readFile(join(wtPath, '.env'), 'utf-8');
      expect(envContent).toBe('SECRET=abc123\n');
    });

    it('creates symlinks for specified directories', async () => {
      const { mkdir: mk, writeFile: wf, lstat } = await import('node:fs/promises');
      // Create a fake node_modules dir
      await mk(join(repo.path, 'node_modules', 'fake-pkg'), { recursive: true });
      await wf(join(repo.path, 'node_modules', 'fake-pkg', 'index.js'), 'module.exports = 1;\n');

      const taskId = 'prov02';
      const branch = 'agex/prov02';
      await wm.createWorktree(taskId, branch);

      await wm.provision(taskId, { symlink: ['node_modules'] });

      const wtPath = join(repo.path, '.agex', 'tasks', taskId);
      const stat = await lstat(join(wtPath, 'node_modules'));
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('does nothing when no copy or symlink configured', async () => {
      const taskId = 'prov03';
      const branch = 'agex/prov03';
      await wm.createWorktree(taskId, branch);

      // Should not throw
      await wm.provision(taskId, {});
    });
  });

  describe('reattachWorktree', () => {
    it('attaches a worktree to an existing branch', async () => {
      const taskId = 'reattach01';
      const branch = 'agex/reattach01';

      // Create worktree (creates branch), then remove worktree only (keep branch)
      await wm.createWorktree(taskId, branch);
      const wtPath = join(repo.path, '.agex', 'tasks', taskId);
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: repo.path, stdio: 'ignore' });

      // Reattach
      const reattachedPath = await wm.reattachWorktree(taskId, branch);
      expect(reattachedPath).toBe(wtPath);
      await access(wtPath);
    });

    it('throws when branch does not exist', async () => {
      await expect(
        wm.reattachWorktree('ghost', 'agex/nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('runSetupHooks', () => {
    it('runs blocking setup commands in the worktree directory', async () => {
      const { writeFile: wf } = await import('node:fs/promises');
      const taskId = 'setup1';
      const branch = 'agex/setup1';
      await wm.createWorktree(taskId, branch);

      const wtPath = join(repo.path, '.agex', 'tasks', taskId);

      await wm.runSetupHooks(taskId, ['touch setup-marker.txt']);

      await access(join(wtPath, 'setup-marker.txt'));
    });

    it('runs multiple setup commands in order', async () => {
      const taskId = 'setup2';
      const branch = 'agex/setup2';
      await wm.createWorktree(taskId, branch);

      const wtPath = join(repo.path, '.agex', 'tasks', taskId);

      await wm.runSetupHooks(taskId, [
        'echo "step1" > order.txt',
        'echo "step2" >> order.txt',
      ]);

      const content = await readFile(join(wtPath, 'order.txt'), 'utf-8');
      expect(content.trim()).toBe('step1\nstep2');
    });

    it('throws when a setup command fails', async () => {
      const taskId = 'setup3';
      const branch = 'agex/setup3';
      await wm.createWorktree(taskId, branch);

      await expect(
        wm.runSetupHooks(taskId, ['exit 1'])
      ).rejects.toThrow();
    });

    it('does nothing with empty setup array', async () => {
      const taskId = 'setup4';
      const branch = 'agex/setup4';
      await wm.createWorktree(taskId, branch);

      // Should not throw
      await wm.runSetupHooks(taskId, []);
    });
  });

  describe('safeRemoveWorktree', () => {
    it('silently succeeds when worktree does not exist', async () => {
      const wm = new WorkspaceManager(repo.path);
      // Should not throw — worktree 'nonexistent' was never created
      await expect(wm.safeRemoveWorktree('nonexistent')).resolves.toBeUndefined();
    });

    it('removes an existing worktree', async () => {
      const wm = new WorkspaceManager(repo.path);
      const { access } = await import('node:fs/promises');

      await wm.createWorktree('cleanup-test', 'agex/cleanup-test');
      const wtPath = worktreePath(repo.path, 'cleanup-test');

      // Verify it exists
      await expect(access(wtPath)).resolves.toBeUndefined();

      await wm.safeRemoveWorktree('cleanup-test');

      // Verify it's gone
      await expect(access(wtPath)).rejects.toThrow();
    });
  });

  describe('safeDeleteBranch', () => {
    it('silently succeeds when branch does not exist', async () => {
      const wm = new WorkspaceManager(repo.path);
      await expect(wm.safeDeleteBranch('agex/nonexistent')).resolves.toBeUndefined();
    });

    it('deletes an existing branch', async () => {
      const wm = new WorkspaceManager(repo.path);
      const { execSync } = await import('node:child_process');

      // Create a branch
      execSync(`git branch agex/delete-me`, { cwd: repo.path, stdio: 'ignore' });

      await wm.safeDeleteBranch('agex/delete-me');

      // Verify branch is gone
      const branches = execSync('git branch', { cwd: repo.path, encoding: 'utf-8' });
      expect(branches).not.toContain('agex/delete-me');
    });
  });
});

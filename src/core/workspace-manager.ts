import simpleGit from 'simple-git';
import { copyFile, symlink, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execaCommand } from 'execa';
import { worktreePath } from '../constants.js';

export class WorkspaceManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async createWorktree(taskId: string, branch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);
    const wtPath = worktreePath(this.repoRoot, taskId);

    await git.raw(['worktree', 'add', '-b', branch, wtPath]);

    return wtPath;
  }

  async reattachWorktree(taskId: string, branch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);
    const wtPath = worktreePath(this.repoRoot, taskId);
    await git.raw(['worktree', 'add', wtPath, branch]);
    return wtPath;
  }

  async createWorktreeFromBranch(taskId: string, newBranch: string, baseBranch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);
    const wtPath = worktreePath(this.repoRoot, taskId);

    // Create new branch from baseBranch and check it out in worktree
    await git.raw(['worktree', 'add', '-b', newBranch, wtPath, baseBranch]);

    return wtPath;
  }

  async provision(
    taskId: string,
    config: { copy?: string[]; symlink?: string[] }
  ): Promise<void> {
    const wtPath = worktreePath(this.repoRoot, taskId);

    // Copy files
    if (config.copy) {
      for (const file of config.copy) {
        const src = join(this.repoRoot, file);
        const dest = join(wtPath, file);
        try {
          await access(src);
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(src, dest);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            continue; // Source doesn't exist, skip
          }
          throw err;
        }
      }
    }

    // Symlink directories
    if (config.symlink) {
      for (const dir of config.symlink) {
        const src = join(this.repoRoot, dir);
        const dest = join(wtPath, dir);
        try {
          await access(src);
          await mkdir(dirname(dest), { recursive: true });
          await symlink(src, dest);
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            continue; // Source doesn't exist, skip
          }
          if (code === 'EEXIST') {
            continue; // Destination already exists (e.g. git checkout created it), skip
          }
          throw err;
        }
      }
    }
  }

  async runSetupHooks(taskId: string, commands: string[]): Promise<void> {
    const wtPath = worktreePath(this.repoRoot, taskId);

    for (const cmd of commands) {
      await execaCommand(cmd, { cwd: wtPath, shell: true });
    }
  }

  async hasUncommittedChanges(taskId: string): Promise<boolean> {
    const wtPath = worktreePath(this.repoRoot, taskId);
    const git = simpleGit(wtPath);
    const status = await git.raw(['status', '--porcelain']);
    return status.trim().length > 0;
  }

  async commitAll(taskId: string, message: string): Promise<string | null> {
    const wtPath = worktreePath(this.repoRoot, taskId);
    const git = simpleGit(wtPath);

    const status = await git.raw(['status', '--porcelain']);
    if (!status.trim()) return null;

    await git.raw(['add', '-A']);
    await git.raw(['commit', '-m', message]);
    return (await git.raw(['rev-parse', 'HEAD'])).trim();
  }

  async safeRemoveWorktree(taskId: string): Promise<void> {
    try {
      const git = simpleGit(this.repoRoot);
      const wtPath = worktreePath(this.repoRoot, taskId);
      await git.raw(['worktree', 'remove', '--force', wtPath]);
    } catch {
      // Worktree may not exist — that's fine
    }
  }

  async safeDeleteBranch(branch: string): Promise<void> {
    try {
      const git = simpleGit(this.repoRoot);
      await git.raw(['branch', '-D', branch]);
    } catch {
      // Branch may not exist — that's fine
    }
  }

  async removeWorktree(taskId: string, branch: string): Promise<void> {
    const git = simpleGit(this.repoRoot);
    const wtPath = worktreePath(this.repoRoot, taskId);

    await git.raw(['worktree', 'remove', '--force', wtPath]);

    try {
      await git.raw(['branch', '-D', branch]);
    } catch {
      // Branch may already be deleted
    }
  }
}

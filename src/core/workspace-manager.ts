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
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            continue; // Source doesn't exist, skip
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

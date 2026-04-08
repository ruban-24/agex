import simpleGit from 'simple-git';
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

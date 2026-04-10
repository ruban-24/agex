import simpleGit from 'simple-git';
import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { worktreePath } from '../../constants.js';

export interface MergeResult {
  id: string;
  merged: boolean;
  strategy?: string;
  commit?: string;
  targetBranch?: string;
  auto_committed?: boolean;
}

export async function mergeCommand(repoRoot: string, taskId: string): Promise<MergeResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const git = simpleGit(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const mergeableStatuses = ['ready', 'completed', 'failed'];
  if (!mergeableStatuses.includes(task.status)) {
    throw new Error(`Cannot merge task in '${task.status}' status (must be: ${mergeableStatuses.join(', ')})`);
  }

  const wtPath = worktreePath(repoRoot, taskId);

  // Auto-commit any uncommitted changes using the task prompt
  let autoCommitted = false;
  const commitSha = await wm.commitAll(taskId, task.prompt);
  if (commitSha) {
    autoCommitted = true;
  }

  // Remove the worktree but keep the branch (git can't merge a checked-out branch)
  await git.raw(['worktree', 'remove', '--force', wtPath]);

  // Attempt merge
  const result = await reviewer.merge(task.branch);

  if (result.success) {
    // Clean up the branch after successful merge
    try {
      await git.raw(['branch', '-D', task.branch]);
    } catch {
      // Branch may already be gone
    }

    let targetBranch: string | undefined;
    try {
      targetBranch = (await git.raw(['symbolic-ref', '--short', 'HEAD'])).trim();
    } catch {}

    await tm.updateStatus(taskId, 'merged');
    return { id: taskId, merged: true, strategy: result.strategy, commit: result.commit, targetBranch, ...(autoCommitted ? { auto_committed: true } : {}) };
  } else {
    // Restore worktree on failure so the task can continue working
    await wm.reattachWorktree(taskId, task.branch);
    return { id: taskId, merged: false };
  }
}

import simpleGit from 'simple-git';
import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { ActivityLogger } from '../../core/activity-logger.js';
import { worktreePath, EXIT_CODES } from '../../constants.js';
import { AgexError } from '../../errors.js';
import { loadConfig } from '../../config/loader.js';

export interface AcceptOptions {
  reviewed?: boolean;
  human?: boolean;
}

export interface AcceptResult {
  id: string;
  merged: boolean;
  strategy?: string;
  commit?: string;
  targetBranch?: string;
  auto_committed?: boolean;
}

export async function acceptCommand(repoRoot: string, taskId: string, options?: AcceptOptions): Promise<AcceptResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const git = simpleGit(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const mergeableStatuses = ['ready', 'completed'];
  if (!mergeableStatuses.includes(task.status)) {
    throw new AgexError(`Cannot merge task in '${task.status}' status (must be: ${mergeableStatuses.join(', ')})`, {
      suggestion: `Run 'agex status ${taskId}' for details`,
    });
  }

  // Review gate: in manual mode, require explicit --reviewed or --human flag
  const config = await loadConfig(repoRoot);
  const reviewMode = config.review ?? 'manual';
  if (reviewMode === 'manual' && !options?.reviewed && !options?.human) {
    throw new AgexError('Review mode is manual — human approval required before merging', {
      suggestion: `Review first:\n  agex summary --human\n  agex review ${taskId} --human\nThen accept:\n  agex accept ${taskId} --reviewed`,
      exitCode: EXIT_CODES.INVALID_ARGS,
    });
  }

  // Lazy aggregation of activity data
  try {
    const activity = new ActivityLogger(repoRoot);
    if (await activity.exists(taskId)) {
      const currentTask = await tm.getTask(taskId);
      if (currentTask && !currentTask.token_usage) {
        const summary = await activity.aggregate(taskId);
        if (summary) {
          await tm.updateTask(taskId, {
            ...(summary.token_usage && { token_usage: summary.token_usage }),
            ...(summary.model && { model: summary.model }),
            ...(summary.turn_count && { turn_count: summary.turn_count }),
            ...(summary.files_modified && { files_modified: summary.files_modified }),
          });
        }
      }
    }
  } catch { /* best-effort */ }

  const wtPath = worktreePath(repoRoot, taskId);

  // Auto-commit any uncommitted changes using the task prompt
  const autoCommitted = Boolean(await wm.commitAll(taskId, task.prompt));

  // Check for dirty working tree files that overlap with the task branch's changes
  const porcelain = (await git.raw(['status', '--porcelain'])).toString();
  const dirtyFiles = porcelain
    .split('\n')
    .filter((line) => line.length > 0 && !line.slice(3).startsWith('.agex/'))
    .map((line) => line.slice(3).trim());

  if (dirtyFiles.length > 0) {
    // Use three-dot diff which implicitly computes merge-base — no separate merge-base call needed
    const branchDiff = await git.raw(['diff', '--name-only', `HEAD...${task.branch}`]);
    const branchFiles = new Set(branchDiff.trim().split('\n').filter(Boolean));

    const overlapping = dirtyFiles.filter((f) => {
      // Handle renames: porcelain shows "old -> new"
      const parts = f.split(' -> ');
      return parts.some((p) => branchFiles.has(p.trim()));
    });

    if (overlapping.length > 0) {
      throw new AgexError(`Working tree has uncommitted changes that conflict with task branch: ${overlapping.join(', ')}`, {
        suggestion: 'Commit or stash the conflicting files before merging',
        exitCode: EXIT_CODES.WORKSPACE_ERROR,
      });
    }
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
    return {
      id: taskId,
      merged: true,
      strategy: result.strategy,
      commit: result.commit,
      targetBranch,
      auto_committed: autoCommitted || undefined,
    };
  } else {
    // Restore worktree on failure so the task can continue working
    await wm.reattachWorktree(taskId, task.branch);
    return { id: taskId, merged: false };
  }
}

import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import type { TaskRecord } from '../../types.js';

export async function discardCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Validate the transition BEFORE destroying the worktree
  const discardableStatuses = ['ready', 'completed', 'failed', 'errored'];
  if (!discardableStatuses.includes(task.status)) {
    throw new Error(
      `Cannot discard task in '${task.status}' status. ` +
      `Task must be in one of: ${discardableStatuses.join(', ')}`
    );
  }

  try {
    await wm.removeWorktree(taskId, task.branch);
  } catch {
    // Worktree may already be removed
  }
  return await tm.updateStatus(taskId, 'discarded');
}

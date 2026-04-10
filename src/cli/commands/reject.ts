import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { ServerManager } from '../../core/server-manager.js';
import { AgexError } from '../../errors.js';
import type { TaskRecord } from '../../types.js';

export async function rejectCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskRecord & { server_stopped?: boolean; uncommitted_changes?: boolean }> {
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const sm = new ServerManager(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const discardableStatuses = ['ready', 'completed', 'failed', 'errored'];
  if (!discardableStatuses.includes(task.status)) {
    throw new AgexError(
      `Cannot reject task in '${task.status}' status. ` +
      `Task must be in one of: ${discardableStatuses.join(', ')}`,
      { suggestion: `Run 'agex status ${taskId}' for details` },
    );
  }

  // Check for uncommitted changes before discarding
  let uncommittedChanges = false;
  try {
    uncommittedChanges = await wm.hasUncommittedChanges(taskId);
  } catch {
    // Worktree may already be gone
  }

  // Kill server if running
  let serverStopped = false;
  if (task.server_pid && sm.isProcessAlive(task.server_pid)) {
    await sm.killProcess(task.server_pid);
    serverStopped = true;
  }

  try {
    await wm.removeWorktree(taskId, task.branch);
  } catch {
    // Worktree may already be removed
  }

  const updated = await tm.updateStatus(taskId, 'discarded');
  return {
    ...updated,
    ...(serverStopped ? { server_stopped: true } : {}),
    ...(uncommittedChanges ? { uncommitted_changes: true } : {}),
  };
}

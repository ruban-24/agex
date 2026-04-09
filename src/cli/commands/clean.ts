import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { ServerManager } from '../../core/server-manager.js';

export interface CleanResult {
  removed: string[];
  kept: string[];
}

export async function cleanCommand(repoRoot: string): Promise<CleanResult> {
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const sm = new ServerManager(repoRoot);
  const tasks = await tm.listTasks();

  const removed: string[] = [];
  const kept: string[] = [];

  for (const task of tasks) {
    if (
      task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'discarded' ||
      task.status === 'merged'
    ) {
      // Kill server if running
      if (task.server_pid && sm.isProcessAlive(task.server_pid)) {
        await sm.killProcess(task.server_pid);
      }

      try {
        await wm.removeWorktree(task.id, task.branch);
      } catch {
        // Worktree may already be removed
      }
      try {
        await tm.deleteTask(task.id);
      } catch {
        // Task file may already be gone
      }
      removed.push(task.id);
    } else {
      kept.push(task.id);
    }
  }

  return { removed, kept };
}

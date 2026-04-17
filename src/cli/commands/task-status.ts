import { TaskManager } from '../../core/task-manager.js';
import { ServerManager } from '../../core/server-manager.js';
import { ActivityLogger } from '../../core/activity-logger.js';
import { AgexError } from '../../errors.js';
import type { TaskRecord } from '../../types.js';

export interface TaskStatusResult extends TaskRecord {
  port: number;
  url: string;
  server_running: boolean;
}

export async function taskStatusCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskStatusResult> {
  const tm = new TaskManager(repoRoot);
  const sm = new ServerManager(repoRoot);

  const found = await tm.getTask(taskId);
  if (!found) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  let task = await sm.clearStaleServer(taskId);

  // Lazy aggregation of activity data
  try {
    const activity = new ActivityLogger(repoRoot);
    if (await activity.exists(taskId)) {
      if (!task.token_usage) {
        const summary = await activity.aggregate(taskId);
        if (summary) {
          const aggregatedFields = {
            ...(summary.token_usage && { token_usage: summary.token_usage }),
            ...(summary.model && { model: summary.model }),
            ...(summary.turn_count != null && { turn_count: summary.turn_count }),
            ...(summary.files_modified && { files_modified: summary.files_modified }),
          };
          await tm.updateTask(taskId, {
            ...aggregatedFields,
          });
          task = { ...task, ...aggregatedFields };
        }
      }
    }
  } catch { /* best-effort */ }

  const port = parseInt(task.env.AGEX_PORT, 10);

  return {
    ...task,
    port,
    url: `http://localhost:${port}`,
    server_running: task.server_pid != null && sm.isProcessAlive(task.server_pid),
  };
}

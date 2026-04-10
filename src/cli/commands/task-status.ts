import { TaskManager } from '../../core/task-manager.js';
import { ServerManager } from '../../core/server-manager.js';
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

  const task = await sm.clearStaleServer(taskId);

  const port = parseInt(task.env.AGEX_PORT, 10);

  return {
    ...task,
    port,
    url: `http://localhost:${port}`,
    server_running: task.server_pid != null && sm.isProcessAlive(task.server_pid),
  };
}

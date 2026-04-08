import { TaskManager } from '../../core/task-manager.js';
import type { TaskRecord } from '../../types.js';

export async function listCommand(repoRoot: string): Promise<TaskRecord[]> {
  const tm = new TaskManager(repoRoot);
  return await tm.listTasks();
}

import { TaskManager } from '../../core/task-manager.js';
import type { TaskRecord } from '../../types.js';

export interface SummaryResult {
  total: number;
  completed: number;
  failed: number;
  running: number;
  ready: number;
  errored: number;
  tasks: TaskRecord[];
}

export async function summaryCommand(repoRoot: string): Promise<SummaryResult> {
  const tm = new TaskManager(repoRoot);
  const tasks = await tm.listTasks();

  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
    running: tasks.filter((t) => t.status === 'running').length,
    ready: tasks.filter((t) => t.status === 'ready').length,
    errored: tasks.filter((t) => t.status === 'errored').length,
    tasks,
  };
}

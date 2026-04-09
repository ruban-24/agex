import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';

export interface CompareTaskInfo {
  id: string;
  prompt: string;
  status: string;
  duration_s?: number;
  checks_passed?: number;
  checks_total?: number;
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface CompareResult {
  tasks: CompareTaskInfo[];
}

export async function compareCommand(
  repoRoot: string,
  taskIds: string[]
): Promise<CompareResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);

  const tasks: CompareTaskInfo[] = [];

  for (const id of taskIds) {
    const task = await tm.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const stats = await reviewer.getDiff(task.branch);

    tasks.push({
      id: task.id,
      prompt: task.prompt,
      status: task.status,
      duration_s: task.duration_s,
      checks_passed: task.verification?.checks.filter((c) => c.passed).length,
      checks_total: task.verification?.checks.length,
      files_changed: stats.files_changed,
      insertions: stats.insertions,
      deletions: stats.deletions,
    });
  }

  return { tasks };
}

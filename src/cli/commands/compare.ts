import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import { AgexError } from '../../errors.js';

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

  const tasks = await Promise.all(
    taskIds.map(async (id) => {
      const task = await tm.getTask(id);
      if (!task) {
        throw new AgexError(`Task not found: ${id}`, {
          suggestion: "Run 'agex list' to see available tasks",
        });
      }

      const stats = await reviewer.getDiff(task.branch);

      return {
        id: task.id,
        prompt: task.prompt,
        status: task.status,
        duration_s: task.duration_s,
        checks_passed: task.verification?.checks.filter((c) => c.passed).length,
        checks_total: task.verification?.checks.length,
        files_changed: stats.files_changed,
        insertions: stats.insertions,
        deletions: stats.deletions,
      };
    })
  );

  return { tasks };
}

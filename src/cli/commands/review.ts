import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import { AgexError } from '../../errors.js';
import type { CommitLogEntry, FileStats } from '../../core/reviewer.js';

export interface ReviewResult {
  id: string;
  prompt: string;
  branch: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  diff: string;
  commits: CommitLogEntry[];
  files: FileStats[];
}

export async function reviewCommand(
  repoRoot: string,
  taskId: string,
  opts?: { includePatch?: boolean },
): Promise<ReviewResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const review = await reviewer.collectReview(task.branch, {
    includePatch: opts?.includePatch ?? true,
  });

  return {
    id: taskId,
    prompt: task.prompt,
    branch: task.branch,
    ...review.stats,
    diff: review.diff ?? '',
    commits: review.commits,
    files: review.files,
  };
}

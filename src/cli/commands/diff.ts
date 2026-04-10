import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import { AgexError } from '../../errors.js';
import type { CommitLogEntry, FileStats } from '../../core/reviewer.js';

export interface DiffResult {
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

export async function diffCommand(repoRoot: string, taskId: string): Promise<DiffResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const stats = await reviewer.getDiff(task.branch);
  const diffText = await reviewer.getDiffText(task.branch);
  const commits = await reviewer.getCommitLog(task.branch);
  const files = await reviewer.getPerFileStats(task.branch);

  return {
    id: taskId,
    prompt: task.prompt,
    branch: task.branch,
    ...stats,
    diff: diffText,
    commits,
    files,
  };
}

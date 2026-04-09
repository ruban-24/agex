import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import type { CommitLogEntry, FileStats } from '../../core/reviewer.js';

export interface DiffResult {
  id: string;
  prompt: string;
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
    throw new Error(`Task not found: ${taskId}`);
  }

  const stats = await reviewer.getDiff(task.branch);
  const diffText = await reviewer.getDiffText(task.branch);
  const commits = await reviewer.getCommitLog(task.branch);
  const files = await reviewer.getPerFileStats(task.branch);

  return {
    id: taskId,
    prompt: task.prompt,
    ...stats,
    diff: diffText,
    commits,
    files,
  };
}

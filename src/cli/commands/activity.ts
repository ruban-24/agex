import { ActivityLogger } from '../../core/activity-logger.js';
import { TaskManager } from '../../core/task-manager.js';
import type { ActivityEvent } from '../../types.js';

export interface ActivityResult {
  id: string;
  events: ActivityEvent[];
  empty: boolean;
}

export async function activityCommand(repoRoot: string, taskId: string): Promise<ActivityResult> {
  const logger = new ActivityLogger(repoRoot);
  const events = await logger.read(taskId);

  // Lazy aggregation: if task doesn't have token_usage, populate from activity log
  if (events.length > 0) {
    try {
      const tm = new TaskManager(repoRoot);
      const task = await tm.getTask(taskId);
      if (task && !task.token_usage) {
        const summary = await logger.aggregate(taskId);
        if (summary) {
          await tm.updateTask(taskId, {
            ...(summary.token_usage && { token_usage: summary.token_usage }),
            ...(summary.model && { model: summary.model }),
            ...(summary.turn_count && { turn_count: summary.turn_count }),
            ...(summary.files_modified && { files_modified: summary.files_modified }),
          });
        }
      }
    } catch {
      // Aggregation is best-effort
    }
  }

  return { id: taskId, events, empty: events.length === 0 };
}

import { ActivityLogger } from '../../core/activity-logger.js';
import type { ActivityEvent } from '../../types.js';

export interface ActivityResult {
  id: string;
  events: ActivityEvent[];
  empty: boolean;
}

export async function activityCommand(repoRoot: string, taskId: string): Promise<ActivityResult> {
  const logger = new ActivityLogger(repoRoot);
  const events = await logger.read(taskId);
  return {
    id: taskId,
    events,
    empty: events.length === 0,
  };
}

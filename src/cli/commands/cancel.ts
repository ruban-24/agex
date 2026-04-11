import { TaskManager } from '../../core/task-manager.js';
import { ServerManager } from '../../core/server-manager.js';
import { AgexError } from '../../errors.js';

export interface CancelResult {
  id: string;
  status: 'errored';
  agent_killed: boolean;
  server_killed: boolean;
}

export async function cancelCommand(
  repoRoot: string,
  taskId: string
): Promise<CancelResult> {
  const tm = new TaskManager(repoRoot);
  const sm = new ServerManager(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const cancellableStatuses = ['running', 'needs-input'];
  if (!cancellableStatuses.includes(task.status)) {
    throw new AgexError(
      `Cannot cancel task in '${task.status}' status (must be: ${cancellableStatuses.join(', ')})`,
      { suggestion: `Run 'agex status ${taskId}' for details` },
    );
  }

  let agentKilled = false;
  let serverKilled = false;

  // Kill agent process if running
  if (task.pid && sm.isProcessAlive(task.pid)) {
    await sm.killProcess(task.pid);
    agentKilled = true;
  }

  // Kill dev server if running
  if (task.server_pid && sm.isProcessAlive(task.server_pid)) {
    await sm.killProcess(task.server_pid);
    serverKilled = true;
    await tm.updateTask(taskId, {
      server_pid: undefined,
      server_started_at: undefined,
    } as any);
  }

  // Transition to errored
  await tm.updateTask(taskId, { error: 'Cancelled by user' });
  await tm.updateStatus(taskId, 'errored');

  return {
    id: taskId,
    status: 'errored',
    agent_killed: agentKilled,
    server_killed: serverKilled,
  };
}

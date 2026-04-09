import { ServerManager } from '../../core/server-manager.js';

export interface TaskStopResult {
  id: string;
  server_running: boolean;
}

export async function taskStopCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskStopResult> {
  const sm = new ServerManager(repoRoot);
  await sm.stopServer(taskId);

  return {
    id: taskId,
    server_running: false,
  };
}

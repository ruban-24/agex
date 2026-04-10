import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { ServerManager } from '../../core/server-manager.js';
import { loadConfig } from '../../config/loader.js';
import { AgexError } from '../../errors.js';

export interface TaskStartResult {
  id: string;
  port: number;
  url: string;
  server_running: boolean;
  server_pid: number;
  warning?: string;
}

const CONCURRENCY_WARN_THRESHOLD = 3;

export async function taskStartCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskStartResult> {
  const config = await loadConfig(repoRoot);
  if (!config.run) {
    throw new Error(
      'No run command configured. Add a `run` field to .agex/config.yml'
    );
  }

  const tm = new TaskManager(repoRoot);
  const sm = new ServerManager(repoRoot);

  const task = await sm.clearStaleServer(taskId);

  const validStatuses = ['ready', 'running', 'completed', 'failed'];
  if (!validStatuses.includes(task.status)) {
    throw new AgexError(
      `Cannot start server for task in '${task.status}' status. ` +
      `Task must be in one of: ${validStatuses.join(', ')}`,
      { suggestion: `Run 'agex task status ${taskId}' for details` },
    );
  }

  if (task.server_pid) {
    throw new Error(`Server already running (pid ${task.server_pid})`);
  }

  const port = parseInt(task.env.AGEX_PORT, 10);
  const wtPath = resolve(repoRoot, task.worktree);

  const env: Record<string, string> = {
    ...task.env,
  };
  if (config.run.port_env) {
    env[config.run.port_env] = String(port);
  }

  const { pid } = await sm.startServer(taskId, config.run.cmd, wtPath, env);

  const activeCount = await sm.countActiveServers();
  let warning: string | undefined;
  if (activeCount >= CONCURRENCY_WARN_THRESHOLD) {
    warning = `${activeCount} servers running — consider stopping idle ones`;
  }

  return {
    id: taskId,
    port,
    url: `http://localhost:${port}`,
    server_running: true,
    server_pid: pid,
    ...(warning ? { warning } : {}),
  };
}

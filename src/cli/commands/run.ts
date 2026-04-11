import { taskCreateCommand } from './task-create.js';
import { taskExecCommand } from './task-exec.js';
import type { TaskRecord, AgexConfig } from '../../types.js';

export interface RunOptions {
  prompt: string;
  cmd: string;
  wait?: boolean;
  timeout?: number;
}

export async function runCommand(
  repoRoot: string,
  options: RunOptions,
  preloadedConfig?: AgexConfig,
): Promise<TaskRecord> {
  // Create task with workspace — pass config through to avoid re-reading
  const task = await taskCreateCommand(repoRoot, {
    prompt: options.prompt,
    cmd: options.cmd,
  }, preloadedConfig);

  // Execute command in the workspace — pass config through
  return await taskExecCommand(repoRoot, task.id, {
    cmd: options.cmd,
    wait: options.wait,
    timeout: options.timeout,
  }, preloadedConfig);
}

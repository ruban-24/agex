import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import type { VerificationCheck } from '../../types.js';

export interface VerifyResult {
  id: string;
  checks: VerificationCheck[];
}

export async function verifyCommand(repoRoot: string, taskId: string): Promise<VerifyResult> {
  const tm = new TaskManager(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const wtPath = resolve(repoRoot, task.worktree);
  const verifyCommands = config.verify || (await detectVerifyCommands(repoRoot));

  const result = await verifier.runChecks(wtPath, verifyCommands);
  await tm.updateTask(taskId, { verification: result });

  return { id: taskId, checks: result.checks };
}

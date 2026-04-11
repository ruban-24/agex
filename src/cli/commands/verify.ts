import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import { AgexError } from '../../errors.js';
import type { VerificationCheck, VerifyCommand } from '../../types.js';

export interface VerifyResult {
  id: string;
  passed: boolean;
  summary: string;
  checks: VerificationCheck[];
}

// Statuses that can transition to 'verifying' (includes 'verifying' to recover from interrupted runs)
const VERIFYABLE_STATUSES = ['running', 'ready', 'verifying'];

export async function verifyCommand(repoRoot: string, taskId: string): Promise<VerifyResult> {
  const tm = new TaskManager(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const wtPath = resolve(repoRoot, task.worktree);
  const verifyCommands: VerifyCommand[] = config.verify || (await detectVerifyCommands(wtPath));

  // Transition to verifying if the state machine allows it
  const canTransition = VERIFYABLE_STATUSES.includes(task.status);
  if (canTransition) {
    await tm.updateStatus(taskId, 'verifying');
  }

  const result = await verifier.runChecks(wtPath, verifyCommands);
  await tm.updateTask(taskId, { verification: result });

  // Transition to final status if we went through verifying
  if (canTransition) {
    const finalStatus = result.passed ? 'completed' : 'failed';
    await tm.updateStatus(taskId, finalStatus);
  }
  // Otherwise (re-verify of completed/failed), just update verification data

  return { id: taskId, passed: result.passed, summary: result.summary, checks: result.checks };
}

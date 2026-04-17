import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { Verifier } from '../../core/verifier.js';
import { ActivityLogger } from '../../core/activity-logger.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import { AgexError } from '../../errors.js';
import type { VerificationCheck, VerifyCommand } from '../../types.js';

export interface VerifyResult {
  id: string;
  passed: boolean;
  summary: string;
  checks: VerificationCheck[];
  review_mode: 'auto' | 'manual';
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

  const activity = new ActivityLogger(repoRoot);
  try {
    await activity.append(taskId, 'task.verify', {
      passed: result.passed,
      summary: result.summary,
      checks: result.checks.map(c => ({ cmd: c.cmd, passed: c.passed, duration_s: c.duration_s })),
    });
  } catch { /* best-effort */ }

  // Lazy aggregation of activity data
  try {
    if (await activity.exists(taskId)) {
      const currentTask = await tm.getTask(taskId);
      if (currentTask && !currentTask.token_usage) {
        const summary = await activity.aggregate(taskId);
        if (summary) {
          await tm.updateTask(taskId, {
            ...(summary.token_usage && { token_usage: summary.token_usage }),
            ...(summary.model && { model: summary.model }),
            ...(summary.turn_count && { turn_count: summary.turn_count }),
            ...(summary.files_modified && { files_modified: summary.files_modified }),
          });
        }
      }
    }
  } catch { /* best-effort */ }

  // Transition to final status if we went through verifying
  if (canTransition) {
    const finalStatus = result.passed ? 'completed' : 'failed';
    await tm.updateStatus(taskId, finalStatus);
  }
  // Otherwise (re-verify of completed/failed), just update verification data

  return { id: taskId, passed: result.passed, summary: result.summary, checks: result.checks, review_mode: config.review ?? 'manual' };
}

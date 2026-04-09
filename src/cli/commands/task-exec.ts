import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { AgentRunner } from '../../core/agent-runner.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import type { TaskRecord } from '../../types.js';

export interface TaskExecOptions {
  cmd: string;
  wait?: boolean;
}

export async function taskExecCommand(
  repoRoot: string,
  taskId: string,
  options: TaskExecOptions
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const runner = new AgentRunner(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const wtPath = resolve(repoRoot, task.worktree);

  // Validate current status before transitioning
  if (task.status === 'running') {
    throw new Error(`Task ${taskId} is already running (pid: ${task.pid || 'unknown'})`);
  }
  if (task.status !== 'ready') {
    throw new Error(
      `Cannot execute task in '${task.status}' status. Task must be 'ready'.`
    );
  }

  await tm.updateStatus(taskId, 'running');

  if (options.wait) {
    // Blocking execution
    const result = await runner.run(taskId, options.cmd, wtPath, { ...task.env });
    await tm.updateTask(taskId, { exit_code: result.exitCode, cmd: options.cmd });

    // Run verification
    const verifyCommands = config.verify || (await detectVerifyCommands(wtPath));
    await tm.updateStatus(taskId, 'verifying');
    const verification = await verifier.runChecks(wtPath, verifyCommands);
    await tm.updateTask(taskId, { verification });

    // Update diff stats
    const { Reviewer } = await import('../../core/reviewer.js');
    const reviewer = new Reviewer(repoRoot);
    const diff_stats = await reviewer.getDiff(task.branch);
    await tm.updateTask(taskId, { diff_stats });

    // Final status
    const finalStatus = verification.passed ? 'completed' : 'failed';
    return await tm.updateStatus(taskId, finalStatus);
  } else {
    // Non-blocking: spawn and return immediately
    const handle = runner.spawn(taskId, options.cmd, wtPath, { ...task.env });
    await tm.updateTask(taskId, { pid: handle.pid, cmd: options.cmd });

    // Register background completion handler
    handle.done.then(async (runResult) => {
      try {
        await tm.updateTask(taskId, { exit_code: runResult.exitCode });

        const verifyCommands = config.verify || (await detectVerifyCommands(wtPath));
        await tm.updateStatus(taskId, 'verifying');
        const verification = await verifier.runChecks(wtPath, verifyCommands);
        await tm.updateTask(taskId, { verification });

        const { Reviewer } = await import('../../core/reviewer.js');
        const rev = new Reviewer(repoRoot);
        const diff_stats = await rev.getDiff(task.branch);
        await tm.updateTask(taskId, { diff_stats });

        const finalStatus = verification.passed ? 'completed' : 'failed';
        await tm.updateStatus(taskId, finalStatus);
      } catch (err) {
        try {
          await tm.updateTask(taskId, { error: err instanceof Error ? err.message : String(err) });
          await tm.updateStatus(taskId, 'errored');
        } catch {
          // Swallow secondary errors in background handler
        }
      }
    });

    return (await tm.getTask(taskId))!;
  }
}

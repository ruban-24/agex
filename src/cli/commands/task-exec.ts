import { resolve, join } from 'node:path';
import { readFile, unlink, access } from 'node:fs/promises';
import { TaskManager } from '../../core/task-manager.js';
import { AgentRunner } from '../../core/agent-runner.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import { AgexError } from '../../errors.js';
import type { TaskRecord, NeedsInputPayload } from '../../types.js';

export interface TaskExecOptions {
  cmd: string;
  wait?: boolean;
}

export async function checkNeedsInput(wtPath: string): Promise<NeedsInputPayload | null> {
  const filePath = join(wtPath, '.agex', 'needs-input.json');
  try {
    await access(filePath);
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (typeof data.question !== 'string' || !data.question) {
      return null; // malformed
    }
    await unlink(filePath);
    return {
      question: data.question,
      options: Array.isArray(data.options) ? data.options : undefined,
      context: typeof data.context === 'string' ? data.context : undefined,
    };
  } catch {
    return null; // file doesn't exist or can't be read
  }
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
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  const wtPath = resolve(repoRoot, task.worktree);

  // Validate current status before transitioning
  if (task.status === 'running') {
    throw new AgexError(`Task ${taskId} is already running (pid: ${task.pid || 'unknown'})`, {
      suggestion: `Run 'agex task status ${taskId}' for details`,
    });
  }
  if (task.status !== 'ready') {
    throw new AgexError(
      `Cannot execute task in '${task.status}' status. Task must be 'ready'.`,
      { suggestion: `Run 'agex task status ${taskId}' for details` },
    );
  }

  await tm.updateStatus(taskId, 'running');

  if (options.wait) {
    // Blocking execution
    const result = await runner.run(taskId, options.cmd, wtPath, { ...task.env });
    await tm.updateTask(taskId, { exit_code: result.exitCode, cmd: options.cmd });

    // Check for needs-input signal
    const needsInput = await checkNeedsInput(wtPath);
    if (needsInput) {
      await tm.updateTask(taskId, { needsInput, cmd: options.cmd });
      return await tm.updateStatus(taskId, 'needs-input');
    }

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

        const needsInput = await checkNeedsInput(wtPath);
        if (needsInput) {
          await tm.updateTask(taskId, { needsInput, cmd: options.cmd });
          await tm.updateStatus(taskId, 'needs-input');
          return; // skip verify
        }

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

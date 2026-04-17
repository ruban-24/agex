import { resolve, join } from 'node:path';
import { readFile, unlink, access } from 'node:fs/promises';
import { TaskManager } from '../../core/task-manager.js';
import { AgentRunner } from '../../core/agent-runner.js';
import { Verifier } from '../../core/verifier.js';
import { ActivityLogger } from '../../core/activity-logger.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import { AgexError } from '../../errors.js';
import { discoverTranscript, parseTranscript } from '../../core/transcript-parser.js';
import type { TaskRecord, NeedsInputPayload, AgexConfig } from '../../types.js';

export interface TaskExecOptions {
  cmd: string;
  wait?: boolean;
  timeout?: number;
}

/**
 * Parse Claude Code transcript for token usage and (when hooks weren't active) behavioral events,
 * append derived events to the activity log, and update the TaskRecord summary fields.
 *
 * Deduplication rule: hooks own behavioral events (tool.call, turn.end, subagent.*, session.end)
 * when active. Transcript is the fallback for those AND always the source of token totals
 * (hooks don't carry token data). Best-effort — errors are swallowed.
 */
export async function finalizeTranscript(
  taskId: string,
  wtPath: string,
  activity: ActivityLogger,
  tm: TaskManager,
): Promise<void> {
  try {
    const transcriptPath = await discoverTranscript(wtPath);
    if (!transcriptPath) return;

    await tm.updateTask(taskId, { transcript_path: transcriptPath });
    const hooksWereActive = await activity.hasToolCalls(taskId);
    const transcript = await parseTranscript(transcriptPath, taskId);

    if (!hooksWereActive) {
      for (const event of transcript.events) {
        await activity.append(taskId, event.event, event.data);
      }
    }

    // Synthetic session.start with model — hooks never emit this, but the
    // --human header's model line depends on it.
    if (transcript.model) {
      await activity.append(taskId, 'session.start', { model: transcript.model });
    }

    // Always write session.end with token usage — hooks don't carry tokens.
    await activity.append(taskId, 'session.end', {
      tokens: transcript.token_usage,
      api_calls: transcript.token_usage.api_call_count,
      turns: transcript.turn_count,
      files_modified: transcript.files_modified,
    });

    await tm.updateTask(taskId, {
      token_usage: transcript.token_usage,
      model: transcript.model,
      turn_count: transcript.turn_count,
      files_modified: transcript.files_modified,
    });
  } catch {
    // Transcript parsing is best-effort
  }
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
  options: TaskExecOptions,
  preloadedConfig?: AgexConfig,
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const runner = new AgentRunner(repoRoot);
  const verifier = new Verifier();
  const config = preloadedConfig ?? await loadConfig(repoRoot);

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
      suggestion: `Run 'agex status ${taskId}' for details`,
    });
  }
  if (task.status !== 'ready') {
    throw new AgexError(
      `Cannot execute task in '${task.status}' status. Task must be 'ready'.`,
      { suggestion: `Run 'agex status ${taskId}' for details` },
    );
  }

  await tm.updateStatus(taskId, 'running');

  const activity = new ActivityLogger(repoRoot);
  const timeoutMs = options.timeout ? options.timeout * 1000 : undefined;

  if (options.wait) {
    // Blocking execution
    try { await activity.append(taskId, 'task.exec.started', { cmd: options.cmd }); } catch { /* best-effort */ }
    const result = await runner.run(taskId, options.cmd, wtPath, { ...task.env }, { timeout: timeoutMs });
    await tm.updateTask(taskId, { exit_code: result.exitCode, cmd: options.cmd });

    await finalizeTranscript(taskId, wtPath, activity, tm);

    // Check for timeout
    if (result.timedOut) {
      await tm.updateTask(taskId, { error: `Agent timed out after ${options.timeout}s` });
      return await tm.updateStatus(taskId, 'errored');
    }

    // Check for needs-input signal
    const needsInput = await checkNeedsInput(wtPath);
    if (needsInput) {
      try { await activity.append(taskId, 'task.needs_input', { question: needsInput.question, options: needsInput.options, context: needsInput.context }); } catch { /* best-effort */ }
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

    // Final status — updateStatus sets finished_at and duration_s, so use the returned task
    // when emitting task.finished (otherwise duration_s would be undefined).
    const finalStatus = verification.passed ? 'completed' : 'failed';
    const finalTask = await tm.updateStatus(taskId, finalStatus);
    try { await activity.append(taskId, 'task.finished', { exit_code: result.exitCode, duration_s: finalTask.duration_s, diff_stats }); } catch { /* best-effort */ }
    return finalTask;
  } else {
    // Non-blocking: spawn and return immediately
    const handle = runner.spawn(taskId, options.cmd, wtPath, { ...task.env }, { timeout: timeoutMs });
    const spawned = await tm.updateTask(taskId, { pid: handle.pid, cmd: options.cmd });
    try { await activity.append(taskId, 'task.exec.started', { cmd: options.cmd, pid: handle.pid }); } catch { /* best-effort */ }

    // Register background completion handler
    handle.done.then(async (runResult) => {
      try {
        await tm.updateTask(taskId, { exit_code: runResult.exitCode });

        await finalizeTranscript(taskId, wtPath, activity, tm);

        // Check for timeout
        if (runResult.timedOut) {
          await tm.updateTask(taskId, { error: `Agent timed out after ${options.timeout}s` });
          await tm.updateStatus(taskId, 'errored');
          return; // skip verify
        }

        const needsInput = await checkNeedsInput(wtPath);
        if (needsInput) {
          try { await activity.append(taskId, 'task.needs_input', { question: needsInput.question, options: needsInput.options, context: needsInput.context }); } catch { /* best-effort */ }
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

        // updateStatus computes duration_s when transitioning to completed/failed/errored,
        // so emit task.finished AFTER the status change using the returned fresh task.
        const finalStatus = verification.passed ? 'completed' : 'failed';
        const finalTask = await tm.updateStatus(taskId, finalStatus);
        try { await activity.append(taskId, 'task.finished', { exit_code: runResult.exitCode, duration_s: finalTask.duration_s, diff_stats }); } catch { /* best-effort */ }
      } catch (err) {
        try {
          await tm.updateTask(taskId, { error: err instanceof Error ? err.message : String(err) });
          await tm.updateStatus(taskId, 'errored');
        } catch {
          // Swallow secondary errors in background handler
        }
      }
    });

    return spawned;
  }
}

import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { loadConfig } from '../../config/loader.js';
import { taskExecCommand } from './task-exec.js';
import { AgexError } from '../../errors.js';
import type { TaskRecord } from '../../types.js';

export interface RetryOptions {
  feedback: string;
  cmd?: string;
  fromScratch?: boolean;
  dryRun?: boolean;
  wait?: boolean;
}

const RETRYABLE_STATUSES = ['failed', 'errored', 'completed'];

export function buildRetryPrompt(original: TaskRecord, feedback: string): string {
  let prompt = original.prompt;

  if (original.verification && !original.verification.passed) {
    prompt += '\n\n## Previous attempt failed\n';
    for (const check of original.verification.checks) {
      if (!check.passed) {
        prompt += `\n### ${check.cmd} (exit ${check.exit_code})\n`;
        if (check.parsed && check.parsed.length > 0) {
          for (const err of check.parsed) {
            prompt += `- ${err.file || ''}`;
            if (err.line) prompt += `:${err.line}`;
            prompt += ` — ${err.message}`;
            if (err.expected) prompt += `\n  Expected: ${err.expected}`;
            if (err.actual) prompt += `\n  Actual: ${err.actual}`;
            prompt += '\n';
          }
        } else if (check.output) {
          const lines = check.output.split('\n');
          const tail = lines.slice(-30).join('\n');
          prompt += `\`\`\`\n${tail}\n\`\`\`\n`;
        }
      }
    }
  }

  prompt += `\n\n## Feedback\n${feedback}`;
  return prompt;
}

export async function retryCommand(
  repoRoot: string,
  taskId: string,
  options: RetryOptions
): Promise<TaskRecord & { prompt: string }> {
  const tm = new TaskManager(repoRoot);
  const original = await tm.getTask(taskId);

  if (!original) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  if (!RETRYABLE_STATUSES.includes(original.status)) {
    throw new AgexError(
      `Cannot retry task in '${original.status}' state. Must be: ${RETRYABLE_STATUSES.join(', ')}`,
      { suggestion: `Run 'agex task status ${taskId}' for details` },
    );
  }

  const enhancedPrompt = buildRetryPrompt(original, options.feedback);

  // Dry run: return prompt without creating task
  if (options.dryRun) {
    return { ...original, prompt: enhancedPrompt };
  }

  const config = await loadConfig(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const cmd = options.cmd || original.cmd;

  if (!cmd) {
    throw new Error('No command specified and original task has no cmd.');
  }

  // Create new task
  const retryDepth = (original.retryDepth || 0) + 1;
  const newTask = await tm.createTask({ prompt: enhancedPrompt, cmd });

  // Store retry metadata
  await tm.updateTask(newTask.id, {
    retriedFrom: original.id,
    retryDepth,
    retryFeedback: options.feedback,
    retryFromScratch: options.fromScratch || false,
  });

  // Transition to provisioning
  await tm.updateStatus(newTask.id, 'provisioning');

  // Create worktree from appropriate base
  const baseBranch = options.fromScratch ? 'HEAD' : original.branch;
  await wm.createWorktreeFromBranch(newTask.id, newTask.branch, baseBranch);

  // Provision
  await wm.provision(newTask.id, {
    copy: config.copy,
    symlink: config.symlink,
  });

  if (config.setup && config.setup.length > 0) {
    await wm.runSetupHooks(newTask.id, config.setup);
  }

  await tm.updateStatus(newTask.id, 'ready');

  // Transition original to retried
  await tm.updateStatus(original.id, 'retried');

  // Execute
  const result = await taskExecCommand(repoRoot, newTask.id, {
    cmd,
    wait: options.wait,
  });

  return { ...result, prompt: enhancedPrompt };
}

import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { AgentRunner } from '../../core/agent-runner.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import { checkNeedsInput } from './task-exec.js';
import { Reviewer } from '../../core/reviewer.js';
import { AgexError } from '../../errors.js';
import type { TaskRecord, QAPair } from '../../types.js';

export interface AnswerOptions {
  text: string;
  cmd?: string;
  wait?: boolean;
}

function buildAnswerPrompt(task: TaskRecord, answer: string): string {
  const responses: QAPair[] = [
    ...(task.responses || []),
    {
      question: task.needsInput!.question,
      answer,
      round: (task.responses?.length || 0) + 1,
    },
  ];

  let prompt = task.prompt;
  prompt += '\n\n## Previous Q&A\n';
  for (const qa of responses) {
    prompt += `\nQ${qa.round}: ${qa.question}\nA${qa.round}: ${qa.answer}\n`;
  }

  return prompt;
}

export async function answerCommand(
  repoRoot: string,
  taskId: string,
  options: AnswerOptions
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const task = await tm.getTask(taskId);

  if (!task) {
    throw new AgexError(`Task not found: ${taskId}`, {
      suggestion: "Run 'agex list' to see available tasks",
    });
  }

  if (task.status !== 'needs-input') {
    throw new AgexError(
      `Task ${taskId} is in '${task.status}' state, not 'needs-input'. Cannot respond.`,
      { suggestion: `Run 'agex status ${taskId}' for details` },
    );
  }

  if (!task.needsInput) {
    throw new Error(`Task ${taskId} has no pending question.`);
  }

  // Build enhanced prompt with Q&A history
  const enhancedPrompt = buildAnswerPrompt(task, options.text);

  // Append to responses, clear needsInput
  const newQA: QAPair = {
    question: task.needsInput.question,
    answer: options.text,
    round: (task.responses?.length || 0) + 1,
  };
  const responses = [...(task.responses || []), newQA];
  await tm.updateTask(taskId, {
    responses,
    needsInput: undefined,
  });

  // Transition back to running state
  await tm.updateStatus(taskId, 'running');

  // Re-execute agent with enhanced prompt in the same worktree
  const cmd = options.cmd || task.cmd;
  if (!cmd) {
    throw new Error(`No command specified and task has no previous cmd.`);
  }

  const runner = new AgentRunner(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);
  const wtPath = resolve(repoRoot, task.worktree);

  if (options.wait) {
    const runResult = await runner.run(taskId, cmd, wtPath, {
      ...task.env,
      AGEX_PROMPT: enhancedPrompt,
    });
    await tm.updateTask(taskId, { exit_code: runResult.exitCode, cmd });

    // Check needs-input again (agent might ask another question)
    const needsInput = await checkNeedsInput(wtPath);
    if (needsInput) {
      await tm.updateTask(taskId, { needsInput, cmd });
      return await tm.updateStatus(taskId, 'needs-input');
    }

    // Run verification
    const verifyCommands = config.verify || (await detectVerifyCommands(wtPath));
    await tm.updateStatus(taskId, 'verifying');
    const verification = await verifier.runChecks(wtPath, verifyCommands);
    await tm.updateTask(taskId, { verification });

    const reviewer = new Reviewer(repoRoot);
    const diff_stats = await reviewer.getDiff(task.branch);
    await tm.updateTask(taskId, { diff_stats });

    const finalStatus = verification.passed ? 'completed' : 'failed';
    return await tm.updateStatus(taskId, finalStatus);
  } else {
    const handle = runner.spawn(taskId, cmd, wtPath, {
      ...task.env,
      AGEX_PROMPT: enhancedPrompt,
    });
    await tm.updateTask(taskId, { pid: handle.pid, cmd });

    handle.done.then(async (runResult) => {
      try {
        await tm.updateTask(taskId, { exit_code: runResult.exitCode });

        const needsInput = await checkNeedsInput(wtPath);
        if (needsInput) {
          await tm.updateTask(taskId, { needsInput, cmd });
          await tm.updateStatus(taskId, 'needs-input');
          return;
        }

        const verifyCommands = config.verify || (await detectVerifyCommands(wtPath));
        await tm.updateStatus(taskId, 'verifying');
        const verification = await verifier.runChecks(wtPath, verifyCommands);
        await tm.updateTask(taskId, { verification });

        const rev = new Reviewer(repoRoot);
        const diff_stats = await rev.getDiff(task.branch);
        await tm.updateTask(taskId, { diff_stats });

        const finalStatus = verification.passed ? 'completed' : 'failed';
        await tm.updateStatus(taskId, finalStatus);
      } catch (err) {
        try {
          await tm.updateTask(taskId, { error: err instanceof Error ? err.message : String(err) });
          await tm.updateStatus(taskId, 'errored');
        } catch { /* swallow */ }
      }
    });

    return (await tm.getTask(taskId))!;
  }
}

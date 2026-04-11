import { resolve } from 'node:path';
import { z } from 'zod/v3';
import { initCommand } from '../cli/commands/init.js';
import { taskCreateCommand } from '../cli/commands/task-create.js';
import { taskExecCommand } from '../cli/commands/task-exec.js';
import { taskStatusCommand } from '../cli/commands/task-status.js';
import { runCommand } from '../cli/commands/run.js';
import { listCommand } from '../cli/commands/list.js';
import { outputCommand } from '../cli/commands/output.js';
import { verifyCommand } from '../cli/commands/verify.js';
import { reviewCommand } from '../cli/commands/review.js';
import { compareCommand } from '../cli/commands/compare.js';
import { summaryCommand } from '../cli/commands/summary.js';
import { acceptCommand } from '../cli/commands/accept.js';
import { rejectCommand } from '../cli/commands/reject.js';
import { cleanCommand } from '../cli/commands/clean.js';
import { taskStartCommand } from '../cli/commands/task-start.js';
import { taskStopCommand } from '../cli/commands/task-stop.js';
import { cancelCommand } from '../cli/commands/cancel.js';
import { retryCommand } from '../cli/commands/retry.js';
import { answerCommand } from '../cli/commands/answer.js';
import { withAbsoluteWorktree, withAbsoluteWorktrees } from '../cli/enrich.js';

function getRepoRoot(): string {
  return resolve(process.cwd());
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function getTools(): ToolDefinition[] {
  return [
    {
      name: 'agex_init',
      description: 'Initialize agex in the current repository',
      inputSchema: {
        verify: z.array(z.string()).optional().describe('Verification commands to run'),
      },
      handler: async (args) => {
        return await initCommand(getRepoRoot(), {
          verify: args.verify as string[] | undefined,
        });
      },
    },
    {
      name: 'agex_create',
      description: 'Create a new task with an isolated git worktree workspace',
      inputSchema: {
        prompt: z.string().optional().describe('Description of the task (required unless --issue is provided)'),
        cmd: z.string().optional().describe('Optional command to execute later'),
        issue: z.string().optional().describe('GitHub issue reference: number (45), URL, or owner/repo#45'),
      },
      handler: async (args) => {
        const result = await taskCreateCommand(getRepoRoot(), {
          prompt: args.prompt as string | undefined,
          cmd: args.cmd as string | undefined,
          issue: args.issue as string | undefined,
        });
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
    {
      name: 'agex_exec',
      description: 'Execute a command inside a task worktree',
      inputSchema: {
        id: z.string().describe('Task ID'),
        cmd: z.string().describe('Command to run'),
        wait: z.boolean().default(true).describe('Wait for completion'),
      },
      handler: async (args) => {
        const result = await taskExecCommand(getRepoRoot(), args.id as string, {
          cmd: args.cmd as string,
          wait: (args.wait as boolean) ?? true,
        });
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
    {
      name: 'agex_start',
      description: 'Start the configured dev server in a task worktree',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await taskStartCommand(getRepoRoot(), args.task_id as string);
      },
    },
    {
      name: 'agex_stop',
      description: 'Stop the dev server running in a task worktree',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await taskStopCommand(getRepoRoot(), args.task_id as string);
      },
    },
    {
      name: 'agex_cancel',
      description: 'Cancel a running or needs-input task (kills agent process and dev server)',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await cancelCommand(getRepoRoot(), args.task_id as string);
      },
    },
    {
      name: 'agex_output',
      description: 'Show captured agent output for a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await outputCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agex_run',
      description: 'Create a task and run a command in its workspace (shortcut for create + exec)',
      inputSchema: {
        prompt: z.string().describe('Description of the task'),
        cmd: z.string().describe('Command to run'),
        wait: z.boolean().default(true).describe('Wait for completion'),
      },
      handler: async (args) => {
        const result = await runCommand(getRepoRoot(), {
          prompt: args.prompt as string,
          cmd: args.cmd as string,
          wait: (args.wait as boolean) ?? true,
        });
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
    {
      name: 'agex_status',
      description: 'Get detailed status for a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        const result = await taskStatusCommand(getRepoRoot(), args.id as string);
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
    {
      name: 'agex_verify',
      description: 'Run verification checks against a task worktree',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await verifyCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agex_review',
      description: 'Show diff of changes in a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await reviewCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agex_compare',
      description: 'Compare multiple tasks side by side',
      inputSchema: {
        ids: z.array(z.string()).describe('Task IDs to compare'),
      },
      handler: async (args) => {
        return await compareCommand(getRepoRoot(), args.ids as string[]);
      },
    },
    {
      name: 'agex_list',
      description: 'List all tasks',
      handler: async () => {
        const result = await listCommand(getRepoRoot());
        return withAbsoluteWorktrees(result, getRepoRoot());
      },
    },
    {
      name: 'agex_accept',
      description: 'Merge a task branch into the current branch',
      inputSchema: {
        id: z.string().describe('Task ID to accept'),
      },
      handler: async (args) => {
        return await acceptCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agex_reject',
      description: 'Reject a task (remove worktree and branch)',
      inputSchema: {
        id: z.string().describe('Task ID to reject'),
      },
      handler: async (args) => {
        const result = await rejectCommand(getRepoRoot(), args.id as string);
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
    {
      name: 'agex_clean',
      description: 'Clean up all completed/discarded task worktrees',
      handler: async () => {
        return await cleanCommand(getRepoRoot());
      },
    },
    {
      name: 'agex_summary',
      description: 'Get a summary of all tasks',
      handler: async () => {
        return await summaryCommand(getRepoRoot());
      },
    },
    {
      name: 'agex_retry',
      description: 'Retry a failed task with feedback. Creates a new task branching from the failed task with an enhanced prompt.',
      inputSchema: {
        taskId: z.string().describe('ID of the task to retry'),
        feedback: z.string().describe('Feedback explaining what to fix'),
        cmd: z.string().optional().describe('Agent command to run'),
        fromScratch: z.boolean().optional().describe('Branch from main instead of failed task'),
        dryRun: z.boolean().optional().describe('Preview prompt without creating task'),
        wait: z.boolean().optional().describe('Wait for agent to complete'),
      },
      handler: async (args) => {
        const result = await retryCommand(getRepoRoot(), args.taskId as string, {
          feedback: args.feedback as string,
          cmd: args.cmd as string | undefined,
          fromScratch: args.fromScratch as boolean | undefined,
          dryRun: args.dryRun as boolean | undefined,
          wait: args.wait as boolean | undefined,
        });
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
    {
      name: 'agex_answer',
      description: 'Answer a question from a task in needs-input state. Re-executes the agent with Q&A context.',
      inputSchema: {
        taskId: z.string().describe('ID of the task to answer'),
        text: z.string().describe('Your answer to the task question'),
        cmd: z.string().optional().describe('Agent command to re-run'),
        wait: z.boolean().optional().describe('Wait for agent to complete'),
      },
      handler: async (args) => {
        const result = await answerCommand(getRepoRoot(), args.taskId as string, {
          text: args.text as string,
          cmd: args.cmd as string | undefined,
          wait: args.wait as boolean | undefined,
        });
        return withAbsoluteWorktree(result, getRepoRoot());
      },
    },
  ];
}

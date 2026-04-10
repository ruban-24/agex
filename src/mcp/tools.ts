import { resolve } from 'node:path';
import { z } from 'zod/v3';
import { initCommand } from '../cli/commands/init.js';
import { taskCreateCommand } from '../cli/commands/task-create.js';
import { taskExecCommand } from '../cli/commands/task-exec.js';
import { taskStatusCommand } from '../cli/commands/task-status.js';
import { runCommand } from '../cli/commands/run.js';
import { listCommand } from '../cli/commands/list.js';
import { logCommand } from '../cli/commands/log.js';
import { verifyCommand } from '../cli/commands/verify.js';
import { diffCommand } from '../cli/commands/diff.js';
import { compareCommand } from '../cli/commands/compare.js';
import { summaryCommand } from '../cli/commands/summary.js';
import { mergeCommand } from '../cli/commands/merge.js';
import { discardCommand } from '../cli/commands/discard.js';
import { cleanCommand } from '../cli/commands/clean.js';
import { taskStartCommand } from '../cli/commands/task-start.js';
import { taskStopCommand } from '../cli/commands/task-stop.js';
import { retryCommand } from '../cli/commands/retry.js';
import { respondCommand } from '../cli/commands/respond.js';

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
      name: 'agex_task_create',
      description: 'Create a new task with an isolated git worktree workspace',
      inputSchema: {
        prompt: z.string().describe('Description of the task'),
        cmd: z.string().optional().describe('Optional command to execute later'),
      },
      handler: async (args) => {
        return await taskCreateCommand(getRepoRoot(), {
          prompt: args.prompt as string,
          cmd: args.cmd as string | undefined,
        });
      },
    },
    {
      name: 'agex_task_exec',
      description: 'Execute a command inside a task worktree',
      inputSchema: {
        id: z.string().describe('Task ID'),
        cmd: z.string().describe('Command to run'),
        wait: z.boolean().default(true).describe('Wait for completion'),
      },
      handler: async (args) => {
        return await taskExecCommand(getRepoRoot(), args.id as string, {
          cmd: args.cmd as string,
          wait: (args.wait as boolean) ?? true,
        });
      },
    },
    {
      name: 'agex_task_start',
      description: 'Start the configured dev server in a task worktree',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await taskStartCommand(getRepoRoot(), args.task_id as string);
      },
    },
    {
      name: 'agex_task_stop',
      description: 'Stop the dev server running in a task worktree',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await taskStopCommand(getRepoRoot(), args.task_id as string);
      },
    },
    {
      name: 'agex_log',
      description: 'Show captured agent output for a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await logCommand(getRepoRoot(), args.id as string);
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
        return await runCommand(getRepoRoot(), {
          prompt: args.prompt as string,
          cmd: args.cmd as string,
          wait: (args.wait as boolean) ?? true,
        });
      },
    },
    {
      name: 'agex_task_status',
      description: 'Get detailed status for a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await taskStatusCommand(getRepoRoot(), args.id as string);
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
      name: 'agex_diff',
      description: 'Show diff of changes in a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await diffCommand(getRepoRoot(), args.id as string);
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
        return await listCommand(getRepoRoot());
      },
    },
    {
      name: 'agex_merge',
      description: 'Merge a task branch into the current branch',
      inputSchema: {
        id: z.string().describe('Task ID to merge'),
      },
      handler: async (args) => {
        return await mergeCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agex_discard',
      description: 'Discard a task (remove worktree and branch)',
      inputSchema: {
        id: z.string().describe('Task ID to discard'),
      },
      handler: async (args) => {
        return await discardCommand(getRepoRoot(), args.id as string);
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
        return await retryCommand(getRepoRoot(), args.taskId as string, {
          feedback: args.feedback as string,
          cmd: args.cmd as string | undefined,
          fromScratch: args.fromScratch as boolean | undefined,
          dryRun: args.dryRun as boolean | undefined,
          wait: args.wait as boolean | undefined,
        });
      },
    },
    {
      name: 'agex_respond',
      description: 'Answer a question from a task in needs-input state. Re-executes the agent with Q&A context.',
      inputSchema: {
        taskId: z.string().describe('ID of the task to respond to'),
        answer: z.string().describe('Your answer to the task question'),
        cmd: z.string().optional().describe('Agent command to re-run'),
        wait: z.boolean().optional().describe('Wait for agent to complete'),
      },
      handler: async (args) => {
        return await respondCommand(getRepoRoot(), args.taskId as string, {
          answer: args.answer as string,
          cmd: args.cmd as string | undefined,
          wait: args.wait as boolean | undefined,
        });
      },
    },
  ];
}

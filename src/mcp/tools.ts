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
      name: 'agentpod_task_create',
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
      name: 'agentpod_run',
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
      name: 'agentpod_task_status',
      description: 'Get detailed status for a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await taskStatusCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_verify',
      description: 'Run verification checks against a task worktree',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await verifyCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_diff',
      description: 'Show diff of changes in a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
      handler: async (args) => {
        return await diffCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_compare',
      description: 'Compare multiple tasks side by side',
      inputSchema: {
        ids: z.array(z.string()).describe('Task IDs to compare'),
      },
      handler: async (args) => {
        return await compareCommand(getRepoRoot(), args.ids as string[]);
      },
    },
    {
      name: 'agentpod_list',
      description: 'List all tasks',
      handler: async () => {
        return await listCommand(getRepoRoot());
      },
    },
    {
      name: 'agentpod_merge',
      description: 'Merge a task branch into the current branch',
      inputSchema: {
        id: z.string().describe('Task ID to merge'),
      },
      handler: async (args) => {
        return await mergeCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_discard',
      description: 'Discard a task (remove worktree and branch)',
      inputSchema: {
        id: z.string().describe('Task ID to discard'),
      },
      handler: async (args) => {
        return await discardCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_clean',
      description: 'Clean up all completed/discarded task worktrees',
      handler: async () => {
        return await cleanCommand(getRepoRoot());
      },
    },
    {
      name: 'agentpod_summary',
      description: 'Get a summary of all tasks',
      handler: async () => {
        return await summaryCommand(getRepoRoot());
      },
    },
  ];
}

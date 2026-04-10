import { Command } from 'commander';
import { accessSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { initCommand } from './cli/commands/init.js';
import { interactiveInit } from './cli/commands/init-interactive.js';
import type { AgentId } from './cli/skill-writer.js';
import { taskCreateCommand } from './cli/commands/task-create.js';
import { taskStatusCommand } from './cli/commands/task-status.js';
import { taskExecCommand } from './cli/commands/task-exec.js';
import { runCommand } from './cli/commands/run.js';
import { listCommand } from './cli/commands/list.js';
import { logCommand } from './cli/commands/log.js';
import { summaryCommand } from './cli/commands/summary.js';
import { verifyCommand } from './cli/commands/verify.js';
import { diffCommand } from './cli/commands/diff.js';
import { compareCommand } from './cli/commands/compare.js';
import { mergeCommand } from './cli/commands/merge.js';
import { discardCommand } from './cli/commands/discard.js';
import { cleanCommand } from './cli/commands/clean.js';
import { taskStartCommand } from './cli/commands/task-start.js';
import { taskStopCommand } from './cli/commands/task-stop.js';
import { formatOutput, humanOutput } from './cli/output.js';
import {
  formatListHuman,
  formatStatusHuman,
  formatSummaryHuman,
  formatDiffHuman,
  formatVerifyHuman,
  formatCompareHuman,
  formatInitHuman,
  formatTaskCreateHuman,
  formatMergeHuman,
  formatDiscardHuman,
  formatCleanHuman,
  formatRunHuman,
  formatTaskExecHuman,
  formatTaskStartHuman,
  formatTaskStopHuman,
  formatErrorHuman,
} from './cli/format/human.js';
import { EXIT_CODES } from './constants.js';
import { resolveWorktreeContext } from './utils/resolve-context.js';

let isHumanMode = false;

const program = new Command();

program
  .name('agex')
  .description('A CLI runtime for running parallel AI coding tasks safely inside real repos')
  .version('0.1.0');

function getRepoRoot(): string {
  const ctx = resolveWorktreeContext();
  if (ctx) return ctx.repoRoot;

  const cwd = resolve(process.cwd());
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
  } catch {
    console.error(
      isHumanMode
        ? humanOutput(formatErrorHuman('Not a git repository. Run this command inside a git repo.'))
        : JSON.stringify({ error: 'Not a git repository' })
    );
    process.exit(EXIT_CODES.INVALID_ARGS);
  }
  return cwd;
}

function resolveTaskId(explicitId?: string): string {
  if (explicitId) return explicitId;
  const ctx = resolveWorktreeContext();
  if (ctx) return ctx.taskId;
  throw new Error('No task ID provided and cwd is not inside a task worktree');
}

function requireInit(repoRoot: string): void {
  try {
    accessSync(join(repoRoot, '.agex'));
  } catch {
    console.error(
      isHumanMode
        ? humanOutput(formatErrorHuman('agex not initialized. Run: agex init'))
        : JSON.stringify({ error: 'agex not initialized. Run: agex init' })
    );
    process.exit(EXIT_CODES.WORKSPACE_ERROR);
  }
}

function handleError(err: unknown, exitCode: number = EXIT_CODES.INVALID_ARGS): never {
  const message = err instanceof Error ? err.message : String(err);
  if (isHumanMode) {
    console.error(humanOutput(formatErrorHuman(message)));
  } else {
    console.error(JSON.stringify({ error: message }));
  }
  process.exit(exitCode);
}

program
  .command('init')
  .description('Initialize agex in the current repository')
  .option('--verify <commands...>', 'Verification commands to run')
  .option('--run <cmd>', 'Dev server command')
  .option('--port-env <var>', 'Env var name for port injection')
  .option('--agents <agents>', 'Agent skill files to generate (comma-separated: claude-code,codex,copilot)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const repoRoot = getRepoRoot();

      if (opts.portEnv && !opts.run) {
        handleError(new Error('--port-env requires --run'), EXIT_CODES.INVALID_ARGS);
      }

      // Non-interactive when any flag is provided
      const isNonInteractive = opts.verify || opts.agents || opts.run;

      let result;
      if (isNonInteractive) {
        const agents: AgentId[] = opts.agents
          ? opts.agents.split(',').map((s: string) => s.trim()) as AgentId[]
          : [];
        const run = opts.run ? { cmd: opts.run, ...(opts.portEnv ? { port_env: opts.portEnv } : {}) } : undefined;
        result = await initCommand(repoRoot, { verify: opts.verify, agents, run });
      } else {
        result = await interactiveInit(repoRoot);
      }

      const useHuman = opts.human || !isNonInteractive;
      console.log(useHuman ? humanOutput(formatInitHuman(result)) : formatOutput(result, false));
      process.exit(EXIT_CODES.SUCCESS);
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task with an isolated workspace')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .option('--cmd <cmd>', 'Command to execute (optional)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await taskCreateCommand(root, {
        prompt: opts.prompt,
        cmd: opts.cmd,
      });
      console.log(opts.human ? humanOutput(formatTaskCreateHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

taskCmd
  .command('status [id]')
  .description('Get detailed status for a task (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await taskStatusCommand(root, taskId);
      if (opts.human) {
        let logContent = '';
        try { logContent = await logCommand(root, taskId); } catch {}
        console.log(humanOutput(formatStatusHuman(result, logContent)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

taskCmd
  .command('exec <id>')
  .description('Execute a command inside a task worktree')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await taskExecCommand(root, id, {
        cmd: opts.cmd,
        wait: opts.wait,
      });
      console.log(opts.human ? humanOutput(formatTaskExecHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.AGENT_FAILED);
    }
  });

taskCmd
  .command('start <id>')
  .description('Start the configured dev server in a task worktree')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await taskStartCommand(root, id);
      console.log(opts.human ? humanOutput(formatTaskStartHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

taskCmd
  .command('stop <id>')
  .description('Stop the dev server running in a task worktree')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await taskStopCommand(root, id);
      console.log(opts.human ? humanOutput(formatTaskStopHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('run')
  .description('Create a task and run a command (shortcut for task create + task exec)')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await runCommand(root, {
        prompt: opts.prompt,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      console.log(opts.human ? humanOutput(formatRunHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.AGENT_FAILED);
    }
  });

program
  .command('list')
  .description('List all tasks')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await listCommand(root);
      console.log(opts.human ? humanOutput(formatListHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('log <id>')
  .description('Show captured agent output for a task')
  .action(async (id) => {
    try {
      const root = getRepoRoot();
      requireInit(root);
      const log = await logCommand(root, id);
      console.log(log);
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('summary')
  .description('Summary of all tasks')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await summaryCommand(root);
      console.log(opts.human ? humanOutput(formatSummaryHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('verify [id]')
  .description('Run verification checks against a task (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await verifyCommand(root, taskId);
      console.log(opts.human ? humanOutput(formatVerifyHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.VERIFICATION_FAILED);
    }
  });

program
  .command('diff [id]')
  .description('Show diff of changes in a task (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await diffCommand(root, taskId);
      console.log(opts.human ? humanOutput(formatDiffHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('compare <ids...>')
  .description('Compare multiple tasks')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (ids, opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await compareCommand(root, ids);
      console.log(opts.human ? humanOutput(formatCompareHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('merge [id]')
  .description('Merge a task branch into the current branch (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await mergeCommand(root, taskId);
      if (!result.merged) {
        if (isHumanMode) {
          console.error(humanOutput(formatErrorHuman(`Merge conflict on ${taskId}`)));
        } else {
          console.error(JSON.stringify({ error: 'Merge conflict', id: taskId }));
        }
        process.exit(EXIT_CODES.MERGE_CONFLICT);
      }
      console.log(opts.human ? humanOutput(formatMergeHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.MERGE_CONFLICT);
    }
  });

program
  .command('discard [id]')
  .description('Discard a task (remove worktree and branch) (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await discardCommand(root, taskId);
      console.log(opts.human ? humanOutput(formatDiscardHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('clean')
  .description('Clean up all completed/discarded task worktrees')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      requireInit(root);
      const result = await cleanCommand(root);
      console.log(opts.human ? humanOutput(formatCleanHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program.parse();

import { Command } from 'commander';
import { accessSync, readFileSync } from 'node:fs';
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
import { outputCommand } from './cli/commands/output.js';
import { summaryCommand } from './cli/commands/summary.js';
import { verifyCommand } from './cli/commands/verify.js';
import { reviewCommand } from './cli/commands/review.js';
import { compareCommand } from './cli/commands/compare.js';
import { acceptCommand } from './cli/commands/accept.js';
import { rejectCommand } from './cli/commands/reject.js';
import { cleanCommand } from './cli/commands/clean.js';
import { retryCommand } from './cli/commands/retry.js';
import { answerCommand } from './cli/commands/answer.js';
import { taskStartCommand } from './cli/commands/task-start.js';
import { taskStopCommand } from './cli/commands/task-stop.js';
import { withAbsoluteWorktree, withAbsoluteWorktrees } from './cli/enrich.js';
import { formatOutput, humanOutput } from './cli/output.js';
import {
  formatListHuman,
  formatStatusHuman,
  formatSummaryHuman,
  formatReviewHuman,
  formatVerifyHuman,
  formatCompareHuman,
  formatInitHuman,
  formatTaskCreateHuman,
  formatAcceptHuman,
  formatRejectHuman,
  formatCleanHuman,
  formatRunHuman,
  formatTaskExecHuman,
  formatTaskStartHuman,
  formatTaskStopHuman,
  formatErrorHuman,
  formatRetryHuman,
  formatRetryDryRunHuman,
  formatAnswerHuman,
} from './cli/format/human.js';
import { EXIT_CODES } from './constants.js';
import { AgexError } from './errors.js';
import { resolveWorktreeContext } from './utils/resolve-context.js';

let isHumanMode = false;

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

const program = new Command();

program
  .name('agex')
  .description('A CLI runtime for running parallel AI coding tasks safely inside real repos')
  .version(pkg.version);

function getRepoRoot(): string {
  const ctx = resolveWorktreeContext();
  if (ctx) return ctx.repoRoot;

  const cwd = resolve(process.cwd());
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
  } catch {
    throw new AgexError('Not a git repository', {
      suggestion: 'agex must be run inside a git repository',
      exitCode: EXIT_CODES.INVALID_ARGS,
    });
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
    throw new AgexError('agex not initialized', {
      suggestion: "Run 'agex init' to initialize this repository",
      exitCode: EXIT_CODES.WORKSPACE_ERROR,
    });
  }
}

function handleError(err: unknown, exitCode: number = EXIT_CODES.INVALID_ARGS): never {
  const message = err instanceof Error ? err.message : String(err);
  const suggestion = err instanceof AgexError ? err.suggestion : undefined;
  const code = err instanceof AgexError ? err.exitCode : exitCode;

  if (isHumanMode) {
    console.error(humanOutput(formatErrorHuman(message, suggestion)));
  } else {
    console.error(JSON.stringify({ error: message, ...(suggestion && { suggestion }) }));
  }
  process.exit(code);
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

program
  .command('create')
  .description('Create a new task with an isolated workspace')
  .option('--prompt <prompt>', 'Description of the task')
  .option('--issue <ref>', 'Create task from a GitHub issue (number, URL, or owner/repo#N)')
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
        issue: opts.issue,
      });
      const enriched = withAbsoluteWorktree(result, root);
      console.log(opts.human ? humanOutput(formatTaskCreateHuman(enriched)) : formatOutput(enriched, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
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
      const enriched = withAbsoluteWorktree(result, root);
      if (opts.human) {
        let logContent = '';
        try { logContent = await outputCommand(root, taskId); } catch {}
        console.log(humanOutput(formatStatusHuman(enriched, logContent)));
      } else {
        console.log(formatOutput(enriched, false));
      }
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
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
      const enriched = withAbsoluteWorktree(result, root);
      console.log(opts.human ? humanOutput(formatTaskExecHuman(enriched)) : formatOutput(enriched, false));
    } catch (err) {
      handleError(err, EXIT_CODES.AGENT_FAILED);
    }
  });

program
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

program
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
  .description('Create a task and run a command (shortcut for create + exec)')
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
      const enriched = withAbsoluteWorktree(result, root);
      console.log(opts.human ? humanOutput(formatRunHuman(enriched)) : formatOutput(enriched, false));
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
      const enriched = withAbsoluteWorktrees(result, root);
      console.log(opts.human ? humanOutput(formatListHuman(enriched)) : formatOutput(enriched, false));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('output <id>')
  .description('Show captured agent output for a task')
  .action(async (id) => {
    try {
      const root = getRepoRoot();
      requireInit(root);
      const log = await outputCommand(root, id);
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
      if (!result.passed) {
        process.exit(EXIT_CODES.VERIFICATION_FAILED);
      }
    } catch (err) {
      handleError(err, EXIT_CODES.VERIFICATION_FAILED);
    }
  });

program
  .command('review [id]')
  .description('Show diff of changes in a task (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await reviewCommand(root, taskId);
      console.log(opts.human ? humanOutput(formatReviewHuman(result)) : formatOutput(result, false));
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
  .command('accept [id]')
  .description('Merge a task branch into the current branch (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await acceptCommand(root, taskId);
      if (!result.merged) {
        throw new AgexError('Merge conflict', {
          suggestion: `Run 'agex review ${taskId}' to see changes, or 'agex reject ${taskId}' to abandon`,
          exitCode: EXIT_CODES.MERGE_CONFLICT,
        });
      }
      console.log(opts.human ? humanOutput(formatAcceptHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.MERGE_CONFLICT);
    }
  });

program
  .command('reject [id]')
  .description('Reject a task (remove worktree and branch) (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      requireInit(root);
      const result = await rejectCommand(root, taskId);
      const enriched = withAbsoluteWorktree(result, root);
      console.log(opts.human ? humanOutput(formatRejectHuman(enriched)) : formatOutput(enriched, false));
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

program
  .command('retry <taskId>')
  .description('Retry a failed task with feedback')
  .requiredOption('--feedback <text>', 'Feedback for the retry')
  .option('--from-scratch', 'Branch from main instead of failed task', false)
  .option('--dry-run', 'Preview the retry prompt without creating a task', false)
  .option('--cmd <command>', 'Agent command to run')
  .option('--wait', 'Wait for agent to complete', false)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (taskId, opts) => {
    try {
      isHumanMode = opts.human;
      const repoRoot = getRepoRoot();
      requireInit(repoRoot);
      const id = resolveTaskId(taskId);
      const result = await retryCommand(repoRoot, id, {
        feedback: opts.feedback,
        fromScratch: opts.fromScratch,
        dryRun: opts.dryRun,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      if (opts.dryRun) {
        console.log(opts.human ? humanOutput(formatRetryDryRunHuman(result.prompt)) : formatOutput({ prompt: result.prompt }, false));
      } else {
        const enriched = withAbsoluteWorktree(result, repoRoot);
        console.log(opts.human ? humanOutput(formatRetryHuman(enriched)) : formatOutput(enriched, false));
      }
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('answer <taskId>')
  .description('Answer a question from a task in needs-input state')
  .requiredOption('--text <text>', 'Your answer to the task question')
  .option('--cmd <command>', 'Agent command to re-run')
  .option('--wait', 'Wait for agent to complete', false)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (taskId, opts) => {
    try {
      isHumanMode = opts.human;
      const repoRoot = getRepoRoot();
      requireInit(repoRoot);
      const id = resolveTaskId(taskId);
      const result = await answerCommand(repoRoot, id, {
        text: opts.text,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      const enriched = withAbsoluteWorktree(result, repoRoot);
      console.log(opts.human ? humanOutput(formatAnswerHuman(enriched)) : formatOutput(enriched, false));
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program.parse();

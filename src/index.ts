import { Command } from 'commander';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type { AgentId } from './cli/skill-writer.js';
import { withAbsoluteWorktree, withAbsoluteWorktrees } from './cli/enrich.js';
import { formatOutput, humanOutput } from './cli/output.js';
import { EXIT_CODES } from './constants.js';
import { AgexError } from './errors.js';
import { resolveWorktreeContext } from './utils/resolve-context.js';
import { ensureWorkspace } from './cli/ensure-workspace.js';

declare const AGEX_VERSION: string;

let isHumanMode = false;

// Lazy-loaded human formatters — only resolved when --human is used
let _humanFmt: typeof import('./cli/format/human.js') | null = null;
async function getHumanFmt() {
  if (!_humanFmt) _humanFmt = await import('./cli/format/human.js');
  return _humanFmt;
}

const program = new Command();

program
  .name('agex')
  .description('A CLI runtime for running parallel AI coding tasks safely inside real repos')
  .version(typeof AGEX_VERSION !== 'undefined' ? AGEX_VERSION : '0.0.0-dev');

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

async function handleError(err: unknown, exitCode: number = EXIT_CODES.INVALID_ARGS): Promise<never> {
  const message = err instanceof Error ? err.message : String(err);
  const suggestion = err instanceof AgexError ? err.suggestion : undefined;
  const code = err instanceof AgexError ? err.exitCode : exitCode;

  if (isHumanMode) {
    const fmt = await getHumanFmt();
    console.error(humanOutput(fmt.formatErrorHuman(message, suggestion)));
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
        await handleError(new Error('--port-env requires --run'), EXIT_CODES.INVALID_ARGS);
      }

      // Non-interactive when any flag is provided
      const isNonInteractive = opts.verify || opts.agents || opts.run;

      let result;
      if (isNonInteractive) {
        const { initCommand } = await import('./cli/commands/init.js');
        const agents: AgentId[] = opts.agents
          ? opts.agents.split(',').map((s: string) => s.trim()) as AgentId[]
          : [];
        const run = opts.run ? { cmd: opts.run, ...(opts.portEnv ? { port_env: opts.portEnv } : {}) } : undefined;
        result = await initCommand(repoRoot, { verify: opts.verify, agents, run });
      } else {
        const { interactiveInit } = await import('./cli/commands/init-interactive.js');
        result = await interactiveInit(repoRoot);
      }

      const useHuman = opts.human || !isNonInteractive;
      if (useHuman) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatInitHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
      process.exit(EXIT_CODES.SUCCESS);
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      // Validate inputs before bootstrapping workspace (Codex fix #5)
      if (!opts.prompt && !opts.issue) {
        await handleError(new AgexError('No prompt provided', {
          suggestion: 'Provide --prompt or --issue to create a task',
          exitCode: EXIT_CODES.INVALID_ARGS,
        }), EXIT_CODES.INVALID_ARGS);
      }
      const { firstRun, monorepo } = await ensureWorkspace(root);
      const { taskCreateCommand } = await import('./cli/commands/task-create.js');
      const result = await taskCreateCommand(root, {
        prompt: opts.prompt,
        cmd: opts.cmd,
        issue: opts.issue,
      });
      const enriched = withAbsoluteWorktree(result, root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatTaskCreateHuman(enriched)));
      } else {
        console.log(formatOutput(enriched, false));
      }
      if (firstRun) {
        if (opts.human) {
          const fmt = await getHumanFmt();
          console.log(humanOutput(fmt.formatFirstRunHuman(monorepo)));
        } else {
          console.log(formatOutput({ _firstRun: true, monorepo }, false));
        }
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const { taskStatusCommand } = await import('./cli/commands/task-status.js');
      const { outputCommand } = await import('./cli/commands/output.js');
      const result = await taskStatusCommand(root, taskId);
      const enriched = withAbsoluteWorktree(result, root);
      if (opts.human) {
        let logContent = '';
        try { logContent = await outputCommand(root, taskId); } catch {}
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatStatusHuman(enriched, logContent)));
      } else {
        console.log(formatOutput(enriched, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('exec <id>')
  .description('Execute a command inside a task worktree')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--timeout <seconds>', 'Kill agent after N seconds', parseInt)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      const { loadConfig } = await import('./config/loader.js');
      const config = await loadConfig(root);
      const { taskExecCommand } = await import('./cli/commands/task-exec.js');
      const result = await taskExecCommand(root, id, {
        cmd: opts.cmd,
        wait: opts.wait,
        timeout: opts.timeout ?? config.timeout,
      }, config);
      const enriched = withAbsoluteWorktree(result, root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatTaskExecHuman(enriched)));
      } else {
        console.log(formatOutput(enriched, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.AGENT_FAILED);
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
      const { taskStartCommand } = await import('./cli/commands/task-start.js');
      const result = await taskStartCommand(root, id);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatTaskStartHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const { taskStopCommand } = await import('./cli/commands/task-stop.js');
      const result = await taskStopCommand(root, id);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatTaskStopHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('cancel [id]')
  .description('Cancel a running or needs-input task (kills agent process)')
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      const { cancelCommand } = await import('./cli/commands/cancel.js');
      const result = await cancelCommand(root, taskId);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatCancelHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('run')
  .description('Create a task and run a command (shortcut for create + exec)')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--timeout <seconds>', 'Kill agent after N seconds', parseInt)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      isHumanMode = opts.human;
      const root = getRepoRoot();
      const { firstRun, monorepo } = await ensureWorkspace(root);
      const { loadConfig } = await import('./config/loader.js');
      const config = await loadConfig(root);
      const { runCommand } = await import('./cli/commands/run.js');
      const result = await runCommand(root, {
        prompt: opts.prompt,
        cmd: opts.cmd,
        wait: opts.wait,
        timeout: opts.timeout ?? config.timeout,
      }, config);
      const enriched = withAbsoluteWorktree(result, root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatRunHuman(enriched)));
      } else {
        console.log(formatOutput(enriched, false));
      }
      if (firstRun) {
        if (opts.human) {
          const fmt = await getHumanFmt();
          console.log(humanOutput(fmt.formatFirstRunHuman(monorepo)));
        } else {
          console.log(formatOutput({ _firstRun: true, monorepo }, false));
        }
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.AGENT_FAILED);
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
      const { listCommand } = await import('./cli/commands/list.js');
      const result = await listCommand(root);
      const enriched = withAbsoluteWorktrees(result, root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatListHuman(enriched)));
      } else {
        console.log(formatOutput(enriched, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('output <id>')
  .description('Show captured agent output for a task')
  .action(async (id) => {
    try {
      const root = getRepoRoot();
      const { outputCommand } = await import('./cli/commands/output.js');
      const log = await outputCommand(root, id);
      console.log(log);
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const { summaryCommand } = await import('./cli/commands/summary.js');
      const result = await summaryCommand(root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatSummaryHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const { verifyCommand } = await import('./cli/commands/verify.js');
      const result = await verifyCommand(root, taskId);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatVerifyHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
      if (!result.passed) {
        process.exit(EXIT_CODES.VERIFICATION_FAILED);
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.VERIFICATION_FAILED);
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
      const { reviewCommand } = await import('./cli/commands/review.js');
      const result = await reviewCommand(root, taskId, { includePatch: !opts.human });
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatReviewHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const { compareCommand } = await import('./cli/commands/compare.js');
      const result = await compareCommand(root, ids);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatCompareHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

program
  .command('accept [id]')
  .description('Merge a task branch into the current branch (infers ID from cwd if inside a worktree)')
  .option('-H, --human', 'Human-friendly output', false)
  .option('--reviewed', 'Confirm human has reviewed (required in manual review mode)', false)
  .action(async (id, opts) => {
    try {
      isHumanMode = opts.human;
      const taskId = resolveTaskId(id);
      const root = getRepoRoot();
      const { acceptCommand } = await import('./cli/commands/accept.js');
      const result = await acceptCommand(root, taskId, { reviewed: opts.reviewed, human: opts.human });
      if (!result.merged) {
        throw new AgexError('Merge conflict', {
          suggestion: `Run 'agex review ${taskId}' to see changes, or 'agex reject ${taskId}' to abandon`,
          exitCode: EXIT_CODES.MERGE_CONFLICT,
        });
      }
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatAcceptHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.MERGE_CONFLICT);
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
      const { rejectCommand } = await import('./cli/commands/reject.js');
      const result = await rejectCommand(root, taskId);
      const enriched = withAbsoluteWorktree(result, root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatRejectHuman(enriched)));
      } else {
        console.log(formatOutput(enriched, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const { cleanCommand } = await import('./cli/commands/clean.js');
      const result = await cleanCommand(root);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatCleanHuman(result)));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.WORKSPACE_ERROR);
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
      const id = resolveTaskId(taskId);
      const { retryCommand } = await import('./cli/commands/retry.js');
      const result = await retryCommand(repoRoot, id, {
        feedback: opts.feedback,
        fromScratch: opts.fromScratch,
        dryRun: opts.dryRun,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      if (opts.dryRun) {
        if (opts.human) {
          const fmt = await getHumanFmt();
          console.log(humanOutput(fmt.formatRetryDryRunHuman(result.prompt)));
        } else {
          console.log(formatOutput({ prompt: result.prompt }, false));
        }
      } else {
        const enriched = withAbsoluteWorktree(result, repoRoot);
        if (opts.human) {
          const fmt = await getHumanFmt();
          console.log(humanOutput(fmt.formatRetryHuman(enriched)));
        } else {
          console.log(formatOutput(enriched, false));
        }
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('answer <taskId>')
  .description('Answer a question from a task in needs-input state')
  .requiredOption('--text <text>', 'Your answer to the task question')
  .option('--cmd <command>', 'Agent command to re-run')
  .option('--wait', 'Wait for agent to complete', false)
  .option('--timeout <seconds>', 'Kill agent after N seconds', parseInt)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (taskId, opts) => {
    try {
      isHumanMode = opts.human;
      const repoRoot = getRepoRoot();
      const { loadConfig } = await import('./config/loader.js');
      const config = await loadConfig(repoRoot);
      const id = resolveTaskId(taskId);
      const { answerCommand } = await import('./cli/commands/answer.js');
      const result = await answerCommand(repoRoot, id, {
        text: opts.text,
        cmd: opts.cmd,
        wait: opts.wait,
        timeout: opts.timeout ?? config.timeout,
      }, config);
      const enriched = withAbsoluteWorktree(result, repoRoot);
      if (opts.human) {
        const fmt = await getHumanFmt();
        console.log(humanOutput(fmt.formatAnswerHuman(enriched)));
      } else {
        console.log(formatOutput(enriched, false));
      }
    } catch (err) {
      await handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('hook <event>', { hidden: true })
  .action(async (event) => {
    try {
      const { hookCommand } = await import('./cli/commands/hook.js');
      await hookCommand(event);
    } catch {
      // Hooks must never fail visibly
    }
  });

program.parse();

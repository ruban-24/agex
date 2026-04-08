import { Command } from 'commander';
import { resolve } from 'node:path';
import { initCommand } from './cli/commands/init.js';
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
import { formatOutput, formatTable } from './cli/output.js';

const program = new Command();

program
  .name('agentpod')
  .description('A CLI runtime for running parallel AI coding tasks safely inside real repos')
  .version('0.1.0');

function getRepoRoot(): string {
  return resolve(process.cwd());
}

program
  .command('init')
  .description('Initialize agentpod in the current repository')
  .option('--verify <commands...>', 'Verification commands to run')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await initCommand(getRepoRoot(), { verify: opts.verify });
    console.log(formatOutput(result, opts.human));
  });

const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task with an isolated workspace')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .option('--cmd <cmd>', 'Command to execute (optional)')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await taskCreateCommand(getRepoRoot(), {
      prompt: opts.prompt,
      cmd: opts.cmd,
    });
    console.log(formatOutput(result, opts.human));
  });

taskCmd
  .command('status <id>')
  .description('Get detailed status for a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await taskStatusCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

taskCmd
  .command('exec <id>')
  .description('Execute a command inside a task worktree')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await taskExecCommand(getRepoRoot(), id, {
      cmd: opts.cmd,
      wait: opts.wait,
    });
    console.log(formatOutput(result, opts.human));
  });

program
  .command('run')
  .description('Create a task and run a command (shortcut for task create + task exec)')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await runCommand(getRepoRoot(), {
      prompt: opts.prompt,
      cmd: opts.cmd,
      wait: opts.wait,
    });
    console.log(formatOutput(result, opts.human));
  });

program
  .command('list')
  .description('List all tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await listCommand(getRepoRoot());
    if (opts.human) {
      const headers = ['ID', 'Status', 'Prompt', 'Files Changed'];
      const rows = result.map((t) => [
        t.id,
        t.status,
        t.prompt.slice(0, 40),
        String(t.diff_stats?.files_changed ?? '-'),
      ]);
      console.log(formatTable(headers, rows));
    } else {
      console.log(formatOutput(result, false));
    }
  });

program
  .command('log <id>')
  .description('Show captured agent output for a task')
  .action(async (id) => {
    const log = await logCommand(getRepoRoot(), id);
    console.log(log);
  });

program
  .command('summary')
  .description('Summary of all tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await summaryCommand(getRepoRoot());
    console.log(formatOutput(result, opts.human));
  });

program
  .command('verify <id>')
  .description('Run verification checks against a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await verifyCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

program
  .command('diff <id>')
  .description('Show diff of changes in a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await diffCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

program
  .command('compare <ids...>')
  .description('Compare multiple tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (ids, opts) => {
    const result = await compareCommand(getRepoRoot(), ids);
    console.log(formatOutput(result, opts.human));
  });

program.parse();

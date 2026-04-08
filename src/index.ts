import { Command } from 'commander';
import { resolve } from 'node:path';
import { initCommand } from './cli/commands/init.js';
import { formatOutput } from './cli/output.js';

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

program.parse();

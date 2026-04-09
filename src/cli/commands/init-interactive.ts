import { detectVerifyCommands, detectProvisioning, detectProjectType, detectRunConfig } from '../../config/auto-detect.js';
import type { RunConfig } from '../../types.js';
import { bold, blue, green, dim } from '../format/colors.js';
import { confirm, editField, editList, multiSelect, type PromptIO, type SelectOption } from '../interactive.js';
import { AGENT_LABELS, VALID_AGENT_IDS, type AgentId } from '../skill-writer.js';
import { initCommand, type InitResult } from './init.js';

export async function interactiveInit(
  repoRoot: string,
  io?: PromptIO,
): Promise<InitResult> {
  const write = (text: string) => {
    if (io) {
      io.output.write(text);
    } else {
      process.stdout.write(text);
    }
  };

  // 1. Detect project type
  const projectType = await detectProjectType(repoRoot);
  if (projectType) {
    write(`\n  ${bold('Detected project:')} ${blue(projectType)}\n`);
  }

  // 2. Detect verify commands
  const detectedVerify = await detectVerifyCommands(repoRoot);
  let verify: string[] = [];

  if (detectedVerify.length > 0) {
    write(`\n  ${bold('Verify commands')} ${dim('(auto-detected)')}\n`);
    write(`  ${dim('Commands agents run to check their work before finishing')}\n`);
    for (const cmd of detectedVerify) {
      write(`    ${green('\u2713')} ${cmd}\n`);
    }
    write('\n');

    const answer = await confirm('Use these verify commands?', { allowEdit: true }, io);

    if (answer === 'yes') {
      verify = detectedVerify;
    } else if (answer === 'edit') {
      verify = await editList(detectedVerify, io);
    }
    // 'no' → verify stays empty
  } else {
    write(`\n  ${dim('No verify commands detected.')}\n\n`);
    verify = await editList([], io);
  }

  // 3. Detect provisioning
  const provisioning = await detectProvisioning(repoRoot);
  const hasProvisioning = provisioning.copy?.length || provisioning.symlink?.length || provisioning.setup?.length;

  let copy: string[] | undefined;
  let symlink: string[] | undefined;
  let setup: string[] | undefined;

  if (hasProvisioning) {
    write(`\n  ${bold('Workspace provisioning')} ${dim('(auto-detected)')}\n`);
    write(`  ${dim('How each task worktree gets its dependencies')}\n`);
    if (provisioning.copy?.length) {
      write(`    ${dim('copy:')}    ${provisioning.copy.join(', ')}  ${dim('- copied into each worktree')}\n`);
    }
    if (provisioning.symlink?.length) {
      write(`    ${dim('symlink:')} ${provisioning.symlink.join(', ')}  ${dim('- shared via symlink')}\n`);
    }
    if (provisioning.setup?.length) {
      write(`    ${dim('setup:')}   ${provisioning.setup.join(', ')}  ${dim('- runs after worktree creation')}\n`);
    }
    write('\n');

    const answer = await confirm('Use this provisioning config?', {}, io);

    if (answer === 'yes') {
      copy = provisioning.copy;
      symlink = provisioning.symlink;
      setup = provisioning.setup;
    }
    // 'no' → skip provisioning
  }
  // If none detected → skip silently

  // 3.5. Detect run config
  const detectedRun = await detectRunConfig(repoRoot);
  let run: RunConfig | undefined;

  if (detectedRun) {
    write(`\n  ${bold('Dev server')} ${dim('(auto-detected)')}\n`);
    write(`  ${dim('Server started per-task so agents can test against it')}\n`);
    write(`    ${dim('cmd:')}      ${detectedRun.cmd}\n`);
    if (detectedRun.port_env) {
      write(`    ${dim('port_env:')} ${detectedRun.port_env}  ${dim('- env var set to an available port')}\n`);
    }
    write('\n');

    const answer = await confirm('Use this run config?', { allowEdit: true }, io);

    if (answer === 'yes') {
      run = detectedRun;
    } else if (answer === 'edit') {
      const cmd = await editField('cmd', detectedRun.cmd, io);
      const portEnv = await editField('port_env', detectedRun.port_env, io);
      if (cmd) {
        run = { cmd, ...(portEnv ? { port_env: portEnv } : {}) };
      }
    }
  }

  // 4. Agent selection
  write(`\n  ${bold('Which agents do you use?')}\n`);
  write(`  ${dim('Agent-specific CLAUDE.md / AGENTS.md files will be generated')}\n`);

  const agentOptions: SelectOption<AgentId>[] = VALID_AGENT_IDS.map((id) => ({
    label: AGENT_LABELS[id],
    value: id,
  }));

  const agents = await multiSelect(agentOptions, io);

  // 5. Call initCommand
  const result = await initCommand(repoRoot, {
    verify: verify.length > 0 ? verify : undefined,
    copy,
    symlink,
    setup,
    run,
    agents: agents.length > 0 ? agents : undefined,
  });

  // Override verify in result to always reflect what user chose (including empty)
  return {
    ...result,
    verify,
    agents,
  };
}

import { detectVerifyCommands, detectProvisioning, detectProjectType } from '../../config/auto-detect.js';
import { confirm, editList, multiSelect, type PromptIO, type SelectOption } from '../interactive.js';
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
    write(`\n  Detected project: ${projectType}\n`);
  }

  // 2. Detect verify commands
  const detectedVerify = await detectVerifyCommands(repoRoot);
  let verify: string[] = [];

  if (detectedVerify.length > 0) {
    write('\n  Verify commands (auto-detected):\n');
    for (const cmd of detectedVerify) {
      write(`    \u2713 ${cmd}\n`);
    }
    write('\n');

    const answer = await confirm('  Use these verify commands?', { allowEdit: true }, io);

    if (answer === 'yes') {
      verify = detectedVerify;
    } else if (answer === 'edit') {
      verify = await editList(detectedVerify, io);
    }
    // 'no' → verify stays empty
  } else {
    write('\n  No verify commands detected.\n\n');
    verify = await editList([], io);
  }

  // 3. Detect provisioning
  const provisioning = await detectProvisioning(repoRoot);
  const hasProvisioning = provisioning.copy?.length || provisioning.symlink?.length || provisioning.setup?.length;

  let copy: string[] | undefined;
  let symlink: string[] | undefined;
  let setup: string[] | undefined;

  if (hasProvisioning) {
    write('\n  Workspace provisioning (auto-detected):\n');
    if (provisioning.copy?.length) {
      write(`    copy:    ${provisioning.copy.join(', ')}\n`);
    }
    if (provisioning.symlink?.length) {
      write(`    symlink: ${provisioning.symlink.join(', ')}\n`);
    }
    if (provisioning.setup?.length) {
      write(`    setup:   ${provisioning.setup.join(', ')}\n`);
    }
    write('\n');

    const answer = await confirm('  Use this provisioning config?', { allowEdit: false }, io);

    if (answer === 'yes') {
      copy = provisioning.copy;
      symlink = provisioning.symlink;
      setup = provisioning.setup;
    }
    // 'no' → skip provisioning
  }
  // If none detected → skip silently

  // 4. Agent selection
  write('\n  Which agents do you use?\n');

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
    agents: agents.length > 0 ? agents : undefined,
  });

  // Override verify in result to always reflect what user chose (including empty)
  return {
    ...result,
    verify,
    agents,
  };
}

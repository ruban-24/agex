import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { AGENTPOD_DIR, TASKS_DIR, WORKTREES_DIR, CONFIG_FILE } from '../../constants.js';
import type { AgentpodConfig, RunConfig } from '../../types.js';
import { type AgentId, writeSkillFiles } from '../skill-writer.js';

const SECTION_COMMENTS: Record<string, string> = {
  verify: '# Commands to verify task results',
  copy: '# Files to copy into each worktree (e.g., secrets not in git)',
  symlink: '# Directories to symlink into worktrees (shared, not copied)',
  setup: '# Commands to run after workspace creation',
  run: '# Dev server started per-task so agents can test against it',
};

export function dumpConfigWithComments(config: AgentpodConfig): string {
  const sections: string[] = [];

  for (const key of ['verify', 'copy', 'symlink', 'setup', 'run'] as const) {
    const value = config[key];
    if (value === undefined) continue;

    const comment = SECTION_COMMENTS[key];
    const yaml = dump({ [key]: value }, { lineWidth: -1 }).trimEnd();
    sections.push(`${comment}\n${yaml}`);
  }

  return sections.join('\n\n') + '\n';
}

export interface InitOptions {
  verify?: string[];
  copy?: string[];
  symlink?: string[];
  setup?: string[];
  run?: RunConfig;
  agents?: AgentId[];
}

export interface InitResult {
  created: boolean;
  files: string[];
  verify: string[];
  run?: RunConfig;
  agents: AgentId[];
}

export async function initCommand(
  repoRoot: string,
  options: InitOptions
): Promise<InitResult> {
  const agentpodDir = join(repoRoot, AGENTPOD_DIR);
  const files: string[] = [];

  // Create directories
  await mkdir(join(agentpodDir, TASKS_DIR), { recursive: true });
  await mkdir(join(agentpodDir, WORKTREES_DIR), { recursive: true });

  // Handle .gitignore
  const gitignorePath = join(repoRoot, '.gitignore');
  let gitignoreContent = '';
  try {
    gitignoreContent = await readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  if (!gitignoreContent.includes('.agentpod/')) {
    gitignoreContent = gitignoreContent.trimEnd() + '\n.agentpod/\n';
    await writeFile(gitignorePath, gitignoreContent);
  }

  // Write config.yml with all config fields (verify + provisioning)
  const hasConfig = options.verify?.length || options.copy?.length ||
    options.symlink?.length || options.setup?.length || options.run;

  if (hasConfig) {
    const config: AgentpodConfig = {};
    if (options.verify?.length) config.verify = options.verify;
    if (options.copy?.length) config.copy = options.copy;
    if (options.symlink?.length) config.symlink = options.symlink;
    if (options.setup?.length) config.setup = options.setup;
    if (options.run) config.run = options.run;
    await writeFile(join(agentpodDir, CONFIG_FILE), dumpConfigWithComments(config));
    files.push('.agentpod/config.yml');
  }

  // Write skill files for selected agents
  const agents = options.agents ?? [];
  if (agents.length > 0) {
    const skillFiles = await writeSkillFiles(repoRoot, agents);
    files.push(...skillFiles);
  }

  return {
    created: true,
    files,
    verify: options.verify ?? [],
    run: options.run,
    agents,
  };
}

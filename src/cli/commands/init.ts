import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { AGEX_DIR, TASKS_DIR, CONFIG_FILE } from '../../constants.js';
import type { AgexConfig, RunConfig } from '../../types.js';
import { type AgentId, writeSkillFiles, writeActivityHooks } from '../skill-writer.js';

const SECTION_COMMENTS: Record<string, string> = {
  review: '# Review mode: auto (agent merges on verify pass) or manual (agent asks before merging)',
  verify: '# Commands to verify task results',
  copy: '# Files to copy into each worktree (e.g., secrets not in git)',
  symlink: '# Directories to symlink into worktrees (shared, not copied)',
  setup: '# Commands to run after workspace creation',
  run: '# Dev server started per-task so agents can test against it',
};

export function dumpConfigWithComments(config: AgexConfig): string {
  const sections: string[] = [];

  for (const key of ['review', 'verify', 'copy', 'symlink', 'setup', 'run'] as const) {
    const value = config[key];
    if (value === undefined) continue;

    const comment = SECTION_COMMENTS[key];
    const yaml = dump({ [key]: value }, { lineWidth: -1 }).trimEnd();
    sections.push(`${comment}\n${yaml}`);
  }

  return sections.join('\n\n') + '\n';
}

export interface InitOptions {
  review?: 'auto' | 'manual';
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
  review?: 'auto' | 'manual';
  verify: string[];
  run?: RunConfig;
  agents: AgentId[];
}

export const TEMPLATE_CONFIG = `# Review mode: auto (agent merges on verify pass) or manual (agent asks before merging)
# review: manual

# Commands to verify task results (uncomment and edit)
# verify:
#   - npm test
#   - npm run lint

# Files to copy into each worktree (e.g., secrets not in git)
# copy:
#   - .env

# Commands to run after workspace creation
# setup:
#   - npm install

# Dev server started per-task so agents can test against it
# run:
#   cmd: npm run dev
#   port_env: PORT
`;

export async function initCommand(
  repoRoot: string,
  options: InitOptions
): Promise<InitResult> {
  const agexDir = join(repoRoot, AGEX_DIR);
  const files: string[] = [];

  // Create directories
  await mkdir(join(agexDir, TASKS_DIR), { recursive: true });

  // Handle .gitignore
  const gitignorePath = join(repoRoot, '.gitignore');
  let gitignoreContent = '';
  try {
    gitignoreContent = await readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  if (!gitignoreContent.includes('.agex/')) {
    gitignoreContent = gitignoreContent.trimEnd() + '\n.agex/\n';
    await writeFile(gitignorePath, gitignoreContent);
  }

  // Write config.yml with all config fields (verify + provisioning)
  const hasConfig = options.review || options.verify?.length || options.copy?.length ||
    options.symlink?.length || options.setup?.length || options.run;

  if (hasConfig) {
    const config: AgexConfig = {};
    if (options.review) config.review = options.review;
    if (options.verify?.length) config.verify = options.verify;
    if (options.copy?.length) config.copy = options.copy;
    if (options.symlink?.length) config.symlink = options.symlink;
    if (options.setup?.length) config.setup = options.setup;
    if (options.run) config.run = options.run;
    await writeFile(join(agexDir, CONFIG_FILE), dumpConfigWithComments(config));
    files.push('.agex/config.yml');
  }

  // Write skill files for selected agents
  const agents = options.agents ?? [];
  if (agents.length > 0) {
    const skillFiles = await writeSkillFiles(repoRoot, agents);
    files.push(...skillFiles);
  }

  // Always install activity hooks for Claude Code (independent of --agents selection)
  const hookFiles = await writeActivityHooks(repoRoot);
  files.push(...hookFiles);

  return {
    created: true,
    files,
    review: options.review,
    verify: options.verify ?? [],
    run: options.run,
    agents,
  };
}

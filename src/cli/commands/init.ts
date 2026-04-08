import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { AGENTPOD_DIR, TASKS_DIR, WORKTREES_DIR, CONFIG_FILE } from '../../constants.js';
import type { AgentpodConfig } from '../../types.js';

export interface InitOptions {
  verify?: string[];
}

export async function initCommand(
  repoRoot: string,
  options: InitOptions
): Promise<{ created: boolean }> {
  const agentpodDir = join(repoRoot, AGENTPOD_DIR);

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

  // Create config.yml if verify commands provided
  if (options.verify && options.verify.length > 0) {
    const config: AgentpodConfig = { verify: options.verify };
    await writeFile(join(agentpodDir, CONFIG_FILE), dump(config));
  }

  return { created: true };
}

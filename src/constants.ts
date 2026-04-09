import { join } from 'node:path';

export const AGENTPOD_DIR = '.agentpod';
export const CONFIG_FILE = 'config.yml';
export const TASKS_DIR = 'tasks';
export const WORKTREES_DIR = 'worktrees';

export function agentpodPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR);
}

export function configPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR, CONFIG_FILE);
}

export function tasksPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR, TASKS_DIR);
}

export function worktreesPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR, WORKTREES_DIR);
}

export function taskFilePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGENTPOD_DIR, TASKS_DIR, `${taskId}.json`);
}

export function taskLogPath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGENTPOD_DIR, TASKS_DIR, `${taskId}.log`);
}

export function worktreePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGENTPOD_DIR, WORKTREES_DIR, taskId);
}

export const EXIT_CODES = {
  SUCCESS: 0,
  AGENT_FAILED: 1,
  VERIFICATION_FAILED: 2,
  MERGE_CONFLICT: 3,
  INVALID_ARGS: 4,
  WORKSPACE_ERROR: 5,
} as const;

export const DEFAULT_PORTS = {
  base: 3000,
  step: 100,
} as const;

export const BRANCH_PREFIX = 'agentpod/';

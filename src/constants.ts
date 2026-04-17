import { join } from 'node:path';

export const AGEX_DIR = '.agex';
export const CONFIG_FILE = 'config.yml';
export const TASKS_DIR = 'tasks';

export function agexPath(repoRoot: string): string {
  return join(repoRoot, AGEX_DIR);
}

export function configPath(repoRoot: string): string {
  return join(repoRoot, AGEX_DIR, CONFIG_FILE);
}

export function tasksPath(repoRoot: string): string {
  return join(repoRoot, AGEX_DIR, TASKS_DIR);
}

export function taskFilePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGEX_DIR, TASKS_DIR, `${taskId}.json`);
}

export function taskLogPath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGEX_DIR, TASKS_DIR, `${taskId}.log`);
}

export function taskActivityPath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGEX_DIR, TASKS_DIR, `${taskId}.activity.jsonl`);
}

export function worktreePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGEX_DIR, TASKS_DIR, taskId);
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

export const BRANCH_PREFIX = 'agex/';

import { readFile } from 'node:fs/promises';
import { taskLogPath } from '../../constants.js';

export async function logCommand(repoRoot: string, taskId: string): Promise<string> {
  const logPath = taskLogPath(repoRoot, taskId);
  return await readFile(logPath, 'utf-8');
}

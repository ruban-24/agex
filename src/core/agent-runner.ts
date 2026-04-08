import { execaCommand } from 'execa';
import { writeFile, appendFile } from 'node:fs/promises';
import { taskLogPath } from '../constants.js';

export interface RunResult {
  exitCode: number;
}

export interface SpawnHandle {
  pid: number;
  kill: () => void;
}

export class AgentRunner {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async run(
    taskId: string,
    cmd: string,
    cwd: string,
    env: Record<string, string>
  ): Promise<RunResult> {
    const logPath = taskLogPath(this.repoRoot, taskId);
    await writeFile(logPath, '');

    try {
      const result = await execaCommand(cmd, {
        cwd,
        shell: true,
        env: { ...process.env, ...env },
        reject: false,
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      await appendFile(logPath, output);

      return { exitCode: result.exitCode ?? 1 };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendFile(logPath, `Error: ${msg}\n`);
      return { exitCode: 1 };
    }
  }

  spawn(
    taskId: string,
    cmd: string,
    cwd: string,
    env: Record<string, string>
  ): SpawnHandle {
    const logPath = taskLogPath(this.repoRoot, taskId);

    const subprocess = execaCommand(cmd, {
      cwd,
      shell: true,
      env: { ...process.env, ...env },
      reject: false,
      detached: false,
    });

    // Write output to log file asynchronously
    const writeLog = async () => {
      try {
        await writeFile(logPath, '');
        const result = await subprocess;
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        await appendFile(logPath, output);
      } catch {
        // Process killed or errored
      }
    };
    writeLog();

    const pid = subprocess.pid ?? 0;

    return {
      pid,
      kill: () => {
        try {
          subprocess.kill();
        } catch {
          // Already dead
        }
      },
    };
  }
}

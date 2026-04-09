import { execaCommand } from 'execa';
import { TaskManager } from './task-manager.js';
import type { TaskRecord } from '../types.js';

const KILL_GRACE_MS = 5000;

export class ServerManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async killProcess(pid: number): Promise<void> {
    if (!this.isProcessAlive(pid)) return;

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }

    const deadline = Date.now() + KILL_GRACE_MS;
    while (Date.now() < deadline && this.isProcessAlive(pid)) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (this.isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    }
  }

  async clearStaleServer(taskId: string): Promise<TaskRecord> {
    const tm = new TaskManager(this.repoRoot);
    const task = await tm.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (task.server_pid && !this.isProcessAlive(task.server_pid)) {
      task.server_pid = undefined;
      task.server_started_at = undefined;
      await tm.saveTask(task);
    }
    return task;
  }

  async countActiveServers(): Promise<number> {
    const tm = new TaskManager(this.repoRoot);
    const tasks = await tm.listTasks();
    let count = 0;
    for (const task of tasks) {
      if (task.server_pid && this.isProcessAlive(task.server_pid)) {
        count++;
      }
    }
    return count;
  }

  async startServer(
    taskId: string,
    cmd: string,
    cwd: string,
    env: Record<string, string>
  ): Promise<{ pid: number }> {
    const subprocess = execaCommand(cmd, {
      cwd,
      shell: true,
      env: { ...process.env, ...env },
      detached: true,
      stdio: 'ignore',
      reject: false,
    });

    subprocess.unref();

    const pid = subprocess.pid;
    if (!pid) throw new Error('Failed to start server process');

    const tm = new TaskManager(this.repoRoot);
    await tm.updateTask(taskId, {
      server_pid: pid,
      server_started_at: new Date().toISOString(),
    } as any);

    return { pid };
  }

  async stopServer(taskId: string): Promise<void> {
    const tm = new TaskManager(this.repoRoot);
    const task = await tm.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.server_pid) throw new Error(`No server running for task ${taskId}`);

    await this.killProcess(task.server_pid);

    task.server_pid = undefined;
    task.server_started_at = undefined;
    await tm.saveTask(task);
  }
}

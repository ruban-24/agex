import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateTaskId } from '../utils/id.js';
import { nextAvailablePort } from '../utils/port.js';
import { ActivityLogger } from './activity-logger.js';
import {
  tasksPath,
  taskFilePath,
  taskLogPath,
  taskActivityPath,
  BRANCH_PREFIX,
  DEFAULT_PORTS,
} from '../constants.js';
import type { TaskRecord, TaskStatus } from '../types.js';

export interface CreateTaskOptions {
  prompt: string;
  cmd?: string;
}

export class TaskManager {
  private repoRoot: string;
  // Write-through cache: populated after saveTask(), used by updateTask/updateStatus
  // to skip the re-read of a file we just wrote. getTask() always reads from disk.
  private writeCache = new Map<string, TaskRecord>();
  private _activity: ActivityLogger | null = null;
  private get activity(): ActivityLogger {
    if (!this._activity) this._activity = new ActivityLogger(this.repoRoot);
    return this._activity;
  }

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async createTask(options: CreateTaskOptions): Promise<TaskRecord> {
    const id = generateTaskId();
    const existingPorts = await this.getUsedPorts();
    const port = nextAvailablePort(existingPorts, DEFAULT_PORTS.base, DEFAULT_PORTS.step);
    const worktreeAbsolute = resolve(this.repoRoot, '.agex', 'tasks', id);

    const task: TaskRecord = {
      id,
      prompt: options.prompt,
      cmd: options.cmd,
      status: 'pending',
      branch: `${BRANCH_PREFIX}${id}`,
      worktree: `.agex/tasks/${id}`,
      created_at: new Date().toISOString(),
      env: {
        AGEX_TASK_ID: id,
        AGEX_WORKTREE: worktreeAbsolute,
        AGEX_PORT: String(port),
      },
    };

    await this.saveTask(task);
    return task;
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    const task = await this.readTaskFromDisk(id);
    if (!task) return null;
    return await this.recoverIfStale(task);
  }

  private async readTaskFromDisk(id: string): Promise<TaskRecord | null> {
    try {
      const content = await readFile(taskFilePath(this.repoRoot, id), 'utf-8');
      return JSON.parse(content) as TaskRecord;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get a task using the write cache if available, to avoid re-reading
   * a file we just wrote. Used internally by updateTask/updateStatus.
   */
  private async getTaskFast(id: string): Promise<TaskRecord | null> {
    const cached = this.writeCache.get(id);
    if (cached) return cached;
    return await this.readTaskFromDisk(id);
  }

  async listTasks(): Promise<TaskRecord[]> {
    try {
      const files = await readdir(tasksPath(this.repoRoot));
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const tasks = await Promise.all(
        jsonFiles.map(async (f) => {
          const content = await readFile(join(tasksPath(this.repoRoot), f), 'utf-8');
          const task = JSON.parse(content) as TaskRecord;
          return await this.recoverIfStale(task);
        })
      );
      return tasks;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async recoverIfStale(task: TaskRecord): Promise<TaskRecord> {
    const isStaleStatus = task.status === 'running' || task.status === 'needs-input';
    if (!isStaleStatus || !task.pid || this.isProcessAlive(task.pid)) {
      return task;
    }

    task.status = 'errored';
    task.error = `Agent process (pid ${task.pid}) died unexpectedly`;
    task.finished_at = new Date().toISOString();
    if (task.started_at) {
      task.duration_s = Math.round(
        (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000
      );
    }
    await this.saveTask(task);
    return task;
  }

  async saveTask(task: TaskRecord): Promise<void> {
    this.writeCache.set(task.id, task);
    await writeFile(taskFilePath(this.repoRoot, task.id), JSON.stringify(task, null, 2));
  }

  private static VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    pending: ['provisioning'],
    provisioning: ['ready', 'errored', 'discarded'],
    ready: ['running', 'verifying', 'merged', 'discarded'],
    running: ['verifying', 'needs-input', 'errored'],
    verifying: ['verifying', 'completed', 'failed'],
    completed: ['merged', 'discarded', 'retried'],
    failed: ['discarded', 'retried'],
    errored: ['discarded', 'retried'],
    'needs-input': ['running', 'errored', 'discarded'],
    merged: [],
    discarded: [],
    retried: [],
  };

  async updateStatus(id: string, newStatus: TaskStatus): Promise<TaskRecord> {
    const task = await this.getTaskFast(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const oldStatus = task.status;
    const allowed = TaskManager.VALID_TRANSITIONS[task.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${task.status} → ${newStatus} (allowed: ${allowed.join(', ')})`
      );
    }

    task.status = newStatus;

    if (newStatus === 'running' && !task.started_at) {
      task.started_at = new Date().toISOString();
    }

    if (
      (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'errored') &&
      !task.finished_at
    ) {
      task.finished_at = new Date().toISOString();
      if (task.started_at) {
        task.duration_s = Math.round(
          (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000
        );
      }
    }

    await this.saveTask(task);
    try { await this.activity.append(id, 'task.status_change', { from: oldStatus, to: newStatus }); } catch { /* best-effort */ }
    return task;
  }

  async updateTask(id: string, updates: Omit<Partial<TaskRecord>, 'id' | 'status'>): Promise<TaskRecord> {
    const task = await this.getTaskFast(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    Object.assign(task, updates);
    await this.saveTask(task);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const task = await this.getTaskFast(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    this.writeCache.delete(id);
    try { await unlink(taskFilePath(this.repoRoot, id)); } catch { /* already gone */ }
    try { await unlink(taskLogPath(this.repoRoot, id)); } catch { /* already gone */ }
    try { await unlink(taskActivityPath(this.repoRoot, id)); } catch { /* already gone */ }
  }

  /**
   * Lightweight port scan: reads only the port field from each task file.
   * Avoids full listTasks() which also runs recoverIfStale on every task.
   */
  private async getUsedPorts(): Promise<number[]> {
    try {
      const files = await readdir(tasksPath(this.repoRoot));
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const ports = await Promise.all(
        jsonFiles.map(async (f) => {
          try {
            const content = await readFile(join(tasksPath(this.repoRoot), f), 'utf-8');
            const task = JSON.parse(content) as TaskRecord;
            return parseInt(task.env.AGEX_PORT, 10);
          } catch {
            return NaN;
          }
        })
      );
      return ports.filter((p) => !isNaN(p));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }
}

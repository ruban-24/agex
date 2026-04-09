import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateTaskId } from '../utils/id.js';
import { calculatePort } from '../utils/port.js';
import {
  tasksPath,
  taskFilePath,
  taskLogPath,
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

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async createTask(options: CreateTaskOptions): Promise<TaskRecord> {
    const id = generateTaskId();
    const existingTasks = await this.listTasks();
    const taskIndex = existingTasks.length;
    const port = calculatePort(taskIndex, DEFAULT_PORTS.base, DEFAULT_PORTS.step);
    const worktreeAbsolute = resolve(this.repoRoot, '.agentpod', 'worktrees', id);

    const task: TaskRecord = {
      id,
      prompt: options.prompt,
      cmd: options.cmd,
      status: 'pending',
      branch: `${BRANCH_PREFIX}${id}`,
      worktree: `.agentpod/worktrees/${id}`,
      created_at: new Date().toISOString(),
      env: {
        AGENTPOD_TASK_ID: id,
        AGENTPOD_WORKTREE: worktreeAbsolute,
        AGENTPOD_PORT: String(port),
      },
    };

    await this.saveTask(task);
    return task;
  }

  async getTask(id: string): Promise<TaskRecord | null> {
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

  async listTasks(): Promise<TaskRecord[]> {
    try {
      const files = await readdir(tasksPath(this.repoRoot));
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const tasks = await Promise.all(
        jsonFiles.map(async (f) => {
          const content = await readFile(join(tasksPath(this.repoRoot), f), 'utf-8');
          return JSON.parse(content) as TaskRecord;
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

  async saveTask(task: TaskRecord): Promise<void> {
    await writeFile(taskFilePath(this.repoRoot, task.id), JSON.stringify(task, null, 2));
  }

  private static VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    pending: ['provisioning'],
    provisioning: ['ready', 'errored'],
    ready: ['running', 'verifying', 'merged', 'discarded'],
    running: ['verifying', 'errored'],
    verifying: ['completed', 'failed'],
    completed: ['merged', 'discarded'],
    failed: ['merged', 'discarded'],
    errored: ['discarded'],
    merged: [],
    discarded: [],
  };

  async updateStatus(id: string, newStatus: TaskStatus): Promise<TaskRecord> {
    const task = await this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

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
    return task;
  }

  async updateTask(id: string, updates: Omit<Partial<TaskRecord>, 'id' | 'status'>): Promise<TaskRecord> {
    const task = await this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    Object.assign(task, updates);
    await this.saveTask(task);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const task = await this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    try { await unlink(taskFilePath(this.repoRoot, id)); } catch { /* already gone */ }
    try { await unlink(taskLogPath(this.repoRoot, id)); } catch { /* already gone */ }
  }
}

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateTaskId } from '../utils/id.js';
import { calculatePortOffset } from '../utils/port.js';
import {
  tasksPath,
  taskFilePath,
  BRANCH_PREFIX,
  DEFAULT_PORTS,
} from '../constants.js';
import type { TaskRecord } from '../types.js';

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
    const portOffset = calculatePortOffset(taskIndex, DEFAULT_PORTS.base, DEFAULT_PORTS.offset);
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
        AGENTPOD_PORT_OFFSET: String(portOffset),
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
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('TaskManager', () => {
  let repo: TestRepo;
  let tm: TaskManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    tm = new TaskManager(repo.path);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('createTask', () => {
    it('creates a task record with pending status', async () => {
      const task = await tm.createTask({ prompt: 'refactor auth' });

      expect(task.id).toMatch(/^[a-z0-9]{6}$/);
      expect(task.prompt).toBe('refactor auth');
      expect(task.status).toBe('pending');
      expect(task.branch).toBe(`agentpod/${task.id}`);
      expect(task.worktree).toBe(`.agentpod/worktrees/${task.id}`);
      expect(task.created_at).toBeTruthy();
      expect(task.env.AGENTPOD_TASK_ID).toBe(task.id);
      expect(task.env.AGENTPOD_WORKTREE).toContain(task.id);
      expect(task.env.AGENTPOD_PORT_OFFSET).toBeTruthy();
    });

    it('persists task record as JSON file', async () => {
      const task = await tm.createTask({ prompt: 'add tests' });

      const filePath = join(repo.path, '.agentpod', 'tasks', `${task.id}.json`);
      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      expect(content.id).toBe(task.id);
      expect(content.prompt).toBe('add tests');
      expect(content.status).toBe('pending');
    });

    it('stores cmd when provided', async () => {
      const task = await tm.createTask({
        prompt: 'refactor auth',
        cmd: 'claude -p "refactor auth"',
      });

      expect(task.cmd).toBe('claude -p "refactor auth"');
    });

    it('assigns incremental port offsets', async () => {
      const task1 = await tm.createTask({ prompt: 'task 1' });
      const task2 = await tm.createTask({ prompt: 'task 2' });

      const port1 = parseInt(task1.env.AGENTPOD_PORT_OFFSET, 10);
      const port2 = parseInt(task2.env.AGENTPOD_PORT_OFFSET, 10);
      expect(port2).toBe(port1 + 100);
    });
  });

  describe('getTask', () => {
    it('reads a task by ID', async () => {
      const created = await tm.createTask({ prompt: 'test task' });
      const fetched = await tm.getTask(created.id);

      expect(fetched).toEqual(created);
    });

    it('returns null for nonexistent task ID', async () => {
      const result = await tm.getTask('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listTasks', () => {
    it('returns empty array when no tasks exist', async () => {
      const tasks = await tm.listTasks();
      expect(tasks).toEqual([]);
    });

    it('returns all tasks', async () => {
      await tm.createTask({ prompt: 'task 1' });
      await tm.createTask({ prompt: 'task 2' });

      const tasks = await tm.listTasks();
      expect(tasks).toHaveLength(2);
    });
  });
});

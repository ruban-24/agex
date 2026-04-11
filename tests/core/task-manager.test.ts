import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('TaskManager', () => {
  let repo: TestRepo;
  let tm: TaskManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
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
      expect(task.branch).toBe(`agex/${task.id}`);
      expect(task.worktree).toBe(`.agex/tasks/${task.id}`);
      expect(task.created_at).toBeTruthy();
      expect(task.env.AGEX_TASK_ID).toBe(task.id);
      expect(task.env.AGEX_WORKTREE).toContain(task.id);
      expect(task.env.AGEX_PORT).toBeTruthy();
    });

    it('persists task record as JSON file', async () => {
      const task = await tm.createTask({ prompt: 'add tests' });

      const filePath = join(repo.path, '.agex', 'tasks', `${task.id}.json`);
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

      const port1 = parseInt(task1.env.AGEX_PORT, 10);
      const port2 = parseInt(task2.env.AGEX_PORT, 10);
      expect(port2).toBe(port1 + 100);
    });

    it('reuses port gaps when tasks are deleted', async () => {
      const task1 = await tm.createTask({ prompt: 'task 1' });
      const task2 = await tm.createTask({ prompt: 'task 2' });
      const port1 = parseInt(task1.env.AGEX_PORT, 10);
      const port2 = parseInt(task2.env.AGEX_PORT, 10);
      await tm.deleteTask(task1.id);
      const task3 = await tm.createTask({ prompt: 'task 3' });
      const port3 = parseInt(task3.env.AGEX_PORT, 10);
      expect(port3).toBe(port1);
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

  describe('updateStatus', () => {
    it('transitions pending to provisioning', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      const updated = await tm.updateStatus(task.id, 'provisioning');

      expect(updated.status).toBe('provisioning');
    });

    it('transitions ready to running and sets started_at', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      const updated = await tm.updateStatus(task.id, 'running');

      expect(updated.status).toBe('running');
      expect(updated.started_at).toBeTruthy();
    });

    it('transitions running to verifying', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      const updated = await tm.updateStatus(task.id, 'verifying');

      expect(updated.status).toBe('verifying');
    });

    it('transitions verifying to completed and sets finished_at and duration_s', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      const updated = await tm.updateStatus(task.id, 'completed');

      expect(updated.status).toBe('completed');
      expect(updated.finished_at).toBeTruthy();
      expect(typeof updated.duration_s).toBe('number');
    });

    it('rejects invalid transitions', async () => {
      const task = await tm.createTask({ prompt: 'test' });

      await expect(tm.updateStatus(task.id, 'completed')).rejects.toThrow(
        /invalid transition/i
      );
    });

    it('throws for nonexistent task', async () => {
      await expect(tm.updateStatus('nope', 'running')).rejects.toThrow(/not found/i);
    });
  });

  describe('updateTask', () => {
    it('updates arbitrary fields on a task', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      const updated = await tm.updateTask(task.id, { pid: 12345, exit_code: 0 });

      expect(updated.pid).toBe(12345);
      expect(updated.exit_code).toBe(0);
    });
  });

  describe('deleteTask', () => {
    it('removes the task JSON file', async () => {
      const task = await tm.createTask({ prompt: 'delete me' });
      expect(await tm.getTask(task.id)).not.toBeNull();
      await tm.deleteTask(task.id);
      expect(await tm.getTask(task.id)).toBeNull();
    });

    it('throws when task does not exist', async () => {
      await expect(tm.deleteTask('nonexistent')).rejects.toThrow('Task not found');
    });
  });

  describe('v0.2.0 state transitions', () => {
    it('transitions running to needs-input', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      const updated = await tm.updateStatus(task.id, 'needs-input');
      expect(updated.status).toBe('needs-input');
    });

    it('transitions needs-input to running', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'needs-input');
      const updated = await tm.updateStatus(task.id, 'running');
      expect(updated.status).toBe('running');
    });

    it('transitions needs-input to discarded', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'needs-input');
      const updated = await tm.updateStatus(task.id, 'discarded');
      expect(updated.status).toBe('discarded');
    });

    it('transitions failed to retried', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      await tm.updateStatus(task.id, 'failed');
      const updated = await tm.updateStatus(task.id, 'retried');
      expect(updated.status).toBe('retried');
    });

    it('transitions errored to retried', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'errored');
      const updated = await tm.updateStatus(task.id, 'retried');
      expect(updated.status).toBe('retried');
    });

    it('transitions completed to retried', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      await tm.updateStatus(task.id, 'completed');
      const updated = await tm.updateStatus(task.id, 'retried');
      expect(updated.status).toBe('retried');
    });

    it('rejects transition from completed to needs-input', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      await tm.updateStatus(task.id, 'completed');
      await expect(tm.updateStatus(task.id, 'needs-input')).rejects.toThrow(/invalid transition/i);
    });

    it('rejects transition from failed to merged', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      await tm.updateStatus(task.id, 'failed');
      await expect(tm.updateStatus(task.id, 'merged')).rejects.toThrow(/invalid transition/i);
    });

    it('rejects transition from retried (terminal)', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      await tm.updateStatus(task.id, 'failed');
      await tm.updateStatus(task.id, 'retried');
      await expect(tm.updateStatus(task.id, 'running')).rejects.toThrow(/invalid transition/i);
    });
  });
});

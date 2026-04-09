import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServerManager } from '../../src/core/server-manager.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('ServerManager', () => {
  let repo: TestRepo;
  let tm: TaskManager;
  let sm: ServerManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    tm = new TaskManager(repo.path);
    sm = new ServerManager(repo.path);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('isProcessAlive', () => {
    it('returns true for the current process', () => {
      expect(sm.isProcessAlive(process.pid)).toBe(true);
    });

    it('returns false for a non-existent PID', () => {
      expect(sm.isProcessAlive(999999)).toBe(false);
    });
  });

  describe('killProcess', () => {
    it('kills a running process', async () => {
      const { execaCommand } = await import('execa');
      const proc = execaCommand('sleep 60', { shell: true, reject: false });
      const pid = proc.pid!;

      expect(sm.isProcessAlive(pid)).toBe(true);
      await sm.killProcess(pid);
      expect(sm.isProcessAlive(pid)).toBe(false);
    });
  });

  describe('clearStaleServer', () => {
    it('clears server_pid when process is dead', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateTask(task.id, {
        server_pid: 999999,
        server_started_at: new Date().toISOString(),
      } as any);

      const updated = await sm.clearStaleServer(task.id);
      expect(updated.server_pid).toBeUndefined();
      expect(updated.server_started_at).toBeUndefined();
    });

    it('preserves server_pid when process is alive', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateTask(task.id, {
        server_pid: process.pid,
        server_started_at: new Date().toISOString(),
      } as any);

      const updated = await sm.clearStaleServer(task.id);
      expect(updated.server_pid).toBe(process.pid);
    });
  });

  describe('countActiveServers', () => {
    it('returns 0 when no servers are running', async () => {
      await tm.createTask({ prompt: 'task 1' });
      const count = await sm.countActiveServers();
      expect(count).toBe(0);
    });

    it('counts tasks with live server_pid', async () => {
      const task = await tm.createTask({ prompt: 'task 1' });
      await tm.updateTask(task.id, {
        server_pid: process.pid,
        server_started_at: new Date().toISOString(),
      } as any);

      const count = await sm.countActiveServers();
      expect(count).toBe(1);
    });
  });
});

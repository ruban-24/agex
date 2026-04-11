import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { cancelCommand } from '../../src/cli/commands/cancel.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

function spawnSleepProcess(): number {
  const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
  child.unref();
  return child.pid!;
}

describe('cancelCommand', () => {
  let repo: TestRepo;
  let tm: TaskManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    tm = new TaskManager(repo.path);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('throws for nonexistent task', async () => {
    await expect(cancelCommand(repo.path, 'nonexistent')).rejects.toThrow(/not found/i);
  });

  it('throws for non-cancellable status', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await expect(cancelCommand(repo.path, task.id)).rejects.toThrow(/cannot cancel/i);
  });

  it('cancels a running task with pid', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');

    const pid = spawnSleepProcess();
    await tm.updateTask(task.id, { pid });

    const result = await cancelCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.status).toBe('errored');
    expect(result.agent_killed).toBe(true);

    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    expect(alive).toBe(false);

    const updated = await tm.getTask(task.id);
    expect(updated!.status).toBe('errored');
    expect(updated!.error).toBe('Cancelled by user');
  }, 15000);

  it('cancels a needs-input task without pid', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'needs-input');

    const result = await cancelCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.status).toBe('errored');
    expect(result.agent_killed).toBe(false);
  });

  it('also kills dev server if running', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');

    const agentPid = spawnSleepProcess();
    const serverPid = spawnSleepProcess();
    await tm.updateTask(task.id, { pid: agentPid, server_pid: serverPid });

    const result = await cancelCommand(repo.path, task.id);

    expect(result.agent_killed).toBe(true);
    expect(result.server_killed).toBe(true);

    let agentAlive = true;
    try { process.kill(agentPid, 0); } catch { agentAlive = false; }
    expect(agentAlive).toBe(false);

    let serverAlive = true;
    try { process.kill(serverPid, 0); } catch { serverAlive = false; }
    expect(serverAlive).toBe(false);
  }, 15000);
});

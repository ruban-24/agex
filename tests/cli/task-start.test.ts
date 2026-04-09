import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { taskStartCommand } from '../../src/cli/commands/task-start.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('taskStartCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('throws when no run config is defined', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    await expect(taskStartCommand(repo.path, task.id)).rejects.toThrow(
      /No run command configured/
    );
  });

  it('throws when task is in terminal state', async () => {
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'echo hello' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    const tm = new TaskManager(repo.path);

    // Force to discarded
    const taskData = await tm.getTask(task.id);
    taskData!.status = 'discarded' as any;
    await tm.saveTask(taskData!);

    await expect(taskStartCommand(repo.path, task.id)).rejects.toThrow(
      /Cannot start server.*discarded/
    );
  });

  it('starts a server and returns port/url/pid', async () => {
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'sleep 60' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });

    const result = await taskStartCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.port).toBeGreaterThan(3000);
    expect(result.url).toBe(`http://localhost:${result.port}`);
    expect(result.server_running).toBe(true);
    expect(result.server_pid).toBeGreaterThan(0);

    // Clean up the process
    try { process.kill(result.server_pid, 'SIGKILL'); } catch {}
  });

  it('throws when server is already running', async () => {
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'sleep 60' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });

    const result = await taskStartCommand(repo.path, task.id);

    await expect(taskStartCommand(repo.path, task.id)).rejects.toThrow(
      /Server already running/
    );

    // Clean up
    try { process.kill(result.server_pid, 'SIGKILL'); } catch {}
  });

  it('injects port_env into server environment', async () => {
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      dump({ run: { cmd: 'env > /tmp/agentpod-test-env.txt && sleep 60', port_env: 'PORT' } })
    );
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });

    const result = await taskStartCommand(repo.path, task.id);

    // Give the process a moment to write the file
    await new Promise((r) => setTimeout(r, 500));

    const { readFile } = await import('node:fs/promises');
    const envContent = await readFile('/tmp/agentpod-test-env.txt', 'utf-8');
    expect(envContent).toContain(`PORT=${result.port}`);
    expect(envContent).toContain(`AGENTPOD_PORT=${result.port}`);

    // Clean up
    try { process.kill(result.server_pid, 'SIGKILL'); } catch {}
    try { const { unlink } = await import('node:fs/promises'); await unlink('/tmp/agentpod-test-env.txt'); } catch {}
  });
});

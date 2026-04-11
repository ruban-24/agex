import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentRunner } from '../../src/core/agent-runner.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('AgentRunner', () => {
  let repo: TestRepo;
  let runner: AgentRunner;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    runner = new AgentRunner(repo.path);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('run (blocking)', () => {
    it('runs a command and returns exit code 0 on success', async () => {
      const result = await runner.run('test01', 'echo "hello world"', repo.path, {});

      expect(result.exitCode).toBe(0);
    });

    it('captures stdout to log file', async () => {
      await runner.run('test02', 'echo "captured output"', repo.path, {});

      const logPath = join(repo.path, '.agex', 'tasks', 'test02.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('captured output');
    });

    it('returns non-zero exit code on failure', async () => {
      const result = await runner.run('test03', 'exit 42', repo.path, {});

      expect(result.exitCode).toBe(42);
    });

    it('passes environment variables to the subprocess', async () => {
      const result = await runner.run(
        'test04',
        'echo $AGEX_TASK_ID',
        repo.path,
        { AGEX_TASK_ID: 'test04' }
      );

      expect(result.exitCode).toBe(0);
      const logPath = join(repo.path, '.agex', 'tasks', 'test04.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('test04');
    });

    it('runs the command in the specified working directory', async () => {
      const result = await runner.run('test05', 'pwd', repo.path, {});

      expect(result.exitCode).toBe(0);
      const logPath = join(repo.path, '.agex', 'tasks', 'test05.log');
      const log = await readFile(logPath, 'utf-8');
      // On macOS, pwd resolves symlinks (e.g. /var -> /private/var)
      const resolvedRepoPath = await realpath(repo.path);
      expect(log.trim()).toBe(resolvedRepoPath);
    });
  });

  describe('spawn (non-blocking)', () => {
    it('returns a pid and running state', async () => {
      const handle = runner.spawn('test06', 'sleep 10', repo.path, {});

      expect(handle.pid).toBeGreaterThan(0);

      // Clean up
      handle.kill();
    });

    it('resolves done promise with exit code when process completes', async () => {
      const handle = runner.spawn('done01', 'echo hello', repo.path, {});
      const result = await handle.done;
      expect(result.exitCode).toBe(0);
    });

    it('resolves done with non-zero exit code on failure', async () => {
      const handle = runner.spawn('done02', 'exit 42', repo.path, {});
      const result = await handle.done;
      expect(result.exitCode).toBe(42);
    });
  });

  describe('timeout', () => {
    it('passes timedOut: false when command completes within timeout', async () => {
      const result = await runner.run('timeout01', 'echo hello', repo.path, {}, { timeout: 30000 });

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { verifyCommand } from '../../src/cli/commands/verify.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('verifyCommand', () => {
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

  it('runs verification checks against a task worktree', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    // Set up verify commands in config
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      'verify:\n  - echo "check passed"\n'
    );

    const task = await taskCreateCommand(repo.path, { prompt: 'verify test' });
    const result = await verifyCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(true);
  });
});

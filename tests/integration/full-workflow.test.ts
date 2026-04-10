import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { initCommand } from '../../src/cli/commands/init.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { runCommand } from '../../src/cli/commands/run.js';
import { verifyCommand } from '../../src/cli/commands/verify.js';
import { reviewCommand } from '../../src/cli/commands/review.js';
import { compareCommand } from '../../src/cli/commands/compare.js';
import { acceptCommand } from '../../src/cli/commands/accept.js';
import { rejectCommand } from '../../src/cli/commands/reject.js';
import { cleanCommand } from '../../src/cli/commands/clean.js';
import { listCommand } from '../../src/cli/commands/list.js';
import { summaryCommand } from '../../src/cli/commands/summary.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('Full Workflow Integration', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    // Clean up all worktrees
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

  it('runs the complete lifecycle: init → create → exec → verify → diff → merge → clean', async () => {
    // Step 1: Init
    await initCommand(repo.path, { verify: ['true'] });
    await access(join(repo.path, '.agex'));
    // Commit .gitignore so the working tree is clean for merge
    execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: repo.path, stdio: 'ignore' });

    // Step 2: Create a task
    const task = await taskCreateCommand(repo.path, { prompt: 'add greeting feature' });
    expect(task.status).toBe('ready');

    // Step 3: Execute a command that makes changes
    const wtPath = join(repo.path, '.agex', 'tasks', task.id);
    await writeFile(join(wtPath, 'greeting.ts'), 'export function greet(name: string) { return `Hello, ${name}!`; }\n');
    execSync('git add . && git commit -m "add greeting"', { cwd: wtPath, stdio: 'ignore' });

    // Step 4: Verify
    const verifyResult = await verifyCommand(repo.path, task.id);
    expect(verifyResult.checks[0].passed).toBe(true);

    // Step 5: Diff
    const diffResult = await reviewCommand(repo.path, task.id);
    expect(diffResult.files_changed).toBe(1);

    // Step 6: Merge
    const mergeResult = await acceptCommand(repo.path, task.id);
    expect(mergeResult.merged).toBe(true);

    // Verify file is on main branch
    const content = await readFile(join(repo.path, 'greeting.ts'), 'utf-8');
    expect(content).toContain('Hello');

    // Step 7: Clean
    const cleanResult = await cleanCommand(repo.path);
    expect(cleanResult.removed.length).toBeGreaterThanOrEqual(0);
  });

  it('runs parallel tasks and compares them', async () => {
    await initCommand(repo.path, { verify: ['true'] });
    // Commit .gitignore so the working tree is clean for merge
    execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: repo.path, stdio: 'ignore' });

    // Create two parallel tasks
    const task1 = await taskCreateCommand(repo.path, { prompt: 'approach 1' });
    const task2 = await taskCreateCommand(repo.path, { prompt: 'approach 2' });

    // Make different changes in each
    const wt1 = join(repo.path, '.agex', 'tasks', task1.id);
    const wt2 = join(repo.path, '.agex', 'tasks', task2.id);

    await writeFile(join(wt1, 'solution.ts'), 'export const approach = "A";\n');
    execSync('git add . && git commit -m "approach A"', { cwd: wt1, stdio: 'ignore' });

    await writeFile(join(wt2, 'solution.ts'), 'export const approach = "B";\nexport const extra = true;\n');
    execSync('git add . && git commit -m "approach B"', { cwd: wt2, stdio: 'ignore' });

    // Compare
    const comparison = await compareCommand(repo.path, [task1.id, task2.id]);
    expect(comparison.tasks).toHaveLength(2);

    // List and summary
    const tasks = await listCommand(repo.path);
    expect(tasks).toHaveLength(2);

    const summary = await summaryCommand(repo.path);
    expect(summary.total).toBe(2);

    // Discard one, merge the other
    await rejectCommand(repo.path, task2.id);
    const merged = await acceptCommand(repo.path, task1.id);
    expect(merged.merged).toBe(true);
  });

  it('handles the run shortcut (create + exec in one shot)', async () => {
    await initCommand(repo.path, { verify: ['true'] });

    const result = await runCommand(repo.path, {
      prompt: 'quick task',
      cmd: 'echo "done"',
      wait: true,
    });

    expect(result.status).toBe('completed');
    expect(result.exit_code).toBe(0);
  });
});

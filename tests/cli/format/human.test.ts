// tests/cli/format/human.test.ts
import { describe, it, expect } from 'vitest';
import { stripAnsi } from '../../../src/cli/format/colors.js';
import {
  formatListHuman,
  formatStatusHuman,
  formatSummaryHuman,
  formatDiffHuman,
  formatVerifyHuman,
  formatCompareHuman,
  formatInitHuman,
  formatTaskCreateHuman,
  formatMergeHuman,
  formatDiscardHuman,
  formatCleanHuman,
  formatRunHuman,
  formatTaskExecHuman,
  formatErrorHuman,
} from '../../../src/cli/format/human.js';
import type { TaskRecord } from '../../../src/types.js';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'abc123',
    prompt: 'Fix the login bug',
    status: 'completed',
    branch: 'agentpod/abc123',
    worktree: '.agentpod/worktrees/abc123',
    created_at: '2026-04-09T00:00:00Z',
    env: {
      AGENTPOD_TASK_ID: 'abc123',
      AGENTPOD_WORKTREE: '/tmp/test/.agentpod/worktrees/abc123',
      AGENTPOD_PORT_OFFSET: '3100',
    },
    ...overrides,
  };
}

describe('formatListHuman', () => {
  it('shows summary line and task cards', () => {
    const tasks = [
      makeTask({ id: 'aaa', status: 'completed', duration_s: 45, diff_stats: { files_changed: 3, insertions: 42, deletions: 8 }, verification: { passed: true, checks: [{ cmd: 'npm test', passed: true, exit_code: 0, duration_s: 1 }] } }),
      makeTask({ id: 'bbb', status: 'failed', prompt: 'Refactor DB', duration_s: 23 }),
    ];
    const result = stripAnsi(formatListHuman(tasks));
    expect(result).toContain('2 tasks');
    expect(result).toContain('aaa');
    expect(result).toContain('bbb');
    expect(result).toContain('completed');
    expect(result).toContain('failed');
  });

  it('shows empty message when no tasks', () => {
    const result = stripAnsi(formatListHuman([]));
    expect(result).toContain('No tasks');
  });
});

describe('formatStatusHuman', () => {
  it('shows task details with sections', () => {
    const task = makeTask({
      duration_s: 45,
      started_at: '2026-04-09T00:00:00Z',
      finished_at: '2026-04-09T00:00:45Z',
      cmd: 'npm run fix',
      diff_stats: { files_changed: 3, insertions: 42, deletions: 8 },
      verification: { passed: true, checks: [{ cmd: 'npm test', passed: true, exit_code: 0, duration_s: 1 }] },
    });
    const result = stripAnsi(formatStatusHuman(task, ''));
    expect(result).toContain('abc123');
    expect(result).toContain('Fix the login bug');
    expect(result).toContain('DETAILS');
    expect(result).toContain('agentpod/abc123');
    expect(result).toContain('VERIFICATION');
    expect(result).toContain('npm test');
  });

  it('shows next action hint for completed task', () => {
    const task = makeTask({ status: 'completed' });
    const result = stripAnsi(formatStatusHuman(task, ''));
    expect(result).toContain('agentpod merge abc123');
  });

  it('includes log tail when provided', () => {
    const task = makeTask();
    const result = stripAnsi(formatStatusHuman(task, 'line1\nline2\nline3\nline4\nline5'));
    expect(result).toContain('LOG');
    expect(result).toContain('line5');
  });
});

describe('formatSummaryHuman', () => {
  it('shows status dots and task cards', () => {
    const data = {
      total: 2,
      completed: 1,
      failed: 1,
      running: 0,
      ready: 0,
      errored: 0,
      tasks: [
        makeTask({ id: 'aaa', status: 'completed' }),
        makeTask({ id: 'bbb', status: 'failed', prompt: 'Refactor DB' }),
      ],
    };
    const result = stripAnsi(formatSummaryHuman(data));
    expect(result).toContain('2 tasks');
    expect(result).toContain('1 completed');
    expect(result).toContain('1 failed');
  });
});

describe('formatDiffHuman', () => {
  it('shows commits and file list', () => {
    const data = {
      id: 'abc123',
      prompt: 'Fix login bug',
      files_changed: 2,
      insertions: 30,
      deletions: 5,
      diff: '',
      commits: [
        { sha: 'bae224d', message: 'Add validation logging' },
        { sha: 'c3f891a', message: 'Fix expiry check' },
      ],
      files: [
        { file: 'src/auth.ts', insertions: 18, deletions: 5, status: 'M' },
        { file: 'src/auth.test.ts', insertions: 12, deletions: 0, status: 'A' },
      ],
    };
    const result = stripAnsi(formatDiffHuman(data));
    expect(result).toContain('abc123');
    expect(result).toContain('COMMITS');
    expect(result).toContain('bae224d');
    expect(result).toContain('Add validation logging');
    expect(result).toContain('FILES');
    expect(result).toContain('src/auth.ts');
    expect(result).toContain('git diff');
  });
});

describe('formatVerifyHuman', () => {
  it('shows checkmarks and summary for all-pass', () => {
    const data = {
      id: 'abc123',
      checks: [
        { cmd: 'npm test', passed: true, exit_code: 0, duration_s: 0.8 },
        { cmd: 'npm run lint', passed: true, exit_code: 0, duration_s: 1.2 },
      ],
    };
    const result = stripAnsi(formatVerifyHuman(data));
    expect(result).toContain('npm test');
    expect(result).toContain('npm run lint');
    expect(result).toContain('All 2 checks passed');
  });

  it('shows failure detail for failed check', () => {
    const data = {
      id: 'abc123',
      checks: [
        { cmd: 'npm test', passed: false, exit_code: 1, duration_s: 3.2, output: 'FAIL src/db.test.ts › should handle timeout\nmore output' },
      ],
    };
    const result = stripAnsi(formatVerifyHuman(data));
    expect(result).toContain('1 of 1 checks failed');
    expect(result).toContain('FAIL src/db.test.ts');
  });
});

describe('formatCompareHuman', () => {
  it('renders a colored table with summary footer', () => {
    const data = {
      tasks: [
        { id: 'aaa', prompt: 'Fix bug', status: 'completed', checks_passed: 3, checks_total: 3, files_changed: 2 },
        { id: 'bbb', prompt: 'Refactor', status: 'failed', checks_passed: 1, checks_total: 3, files_changed: 4 },
      ],
    };
    const result = stripAnsi(formatCompareHuman(data));
    expect(result).toContain('aaa');
    expect(result).toContain('bbb');
    expect(result).toContain('2 tasks');
  });
});

describe('action formatters', () => {
  it('formatInitHuman shows confirmation and next action', () => {
    const result = stripAnsi(formatInitHuman({ created: true }));
    expect(result).toContain('Initialized');
    expect(result).toContain('agentpod task create');
  });

  it('formatTaskCreateHuman shows task card', () => {
    const task = makeTask({ status: 'ready' });
    const result = stripAnsi(formatTaskCreateHuman(task));
    expect(result).toContain('Created task abc123');
    expect(result).toContain('agentpod task exec');
  });

  it('formatMergeHuman shows merge result', () => {
    const result = stripAnsi(formatMergeHuman({ id: 'abc123', merged: true, strategy: 'fast-forward', commit: 'bae224d' }));
    expect(result).toContain('Merged abc123');
    expect(result).toContain('fast-forward');
    expect(result).toContain('agentpod clean');
  });

  it('formatDiscardHuman shows discard confirmation', () => {
    const task = makeTask({ status: 'discarded' });
    const result = stripAnsi(formatDiscardHuman(task));
    expect(result).toContain('Discarded abc123');
    expect(result).toContain('Fix the login bug');
  });

  it('formatCleanHuman shows cleaned count', () => {
    const result = stripAnsi(formatCleanHuman({ removed: ['aaa', 'bbb'], kept: [] }));
    expect(result).toContain('Cleaned 2 worktrees');
    expect(result).toContain('aaa');
  });

  it('formatRunHuman shows completed task card for wait=true result', () => {
    const task = makeTask({ status: 'completed', duration_s: 12, diff_stats: { files_changed: 2, insertions: 28, deletions: 3 }, verification: { passed: true, checks: [{ cmd: 'npm test', passed: true, exit_code: 0, duration_s: 1 }] } });
    const result = stripAnsi(formatRunHuman(task));
    expect(result).toContain('completed');
    expect(result).toContain('abc123');
    expect(result).toContain('agentpod diff');
  });

  it('formatTaskExecHuman shows running task for non-blocking', () => {
    const task = makeTask({ status: 'running', pid: 12345 });
    const result = stripAnsi(formatTaskExecHuman(task));
    expect(result).toContain('running');
    expect(result).toContain('pid: 12345');
  });
});

describe('formatErrorHuman', () => {
  it('formats error as plain text', () => {
    const result = stripAnsi(formatErrorHuman('Task not found: xyz'));
    expect(result).toContain('error:');
    expect(result).toContain('Task not found: xyz');
  });
});

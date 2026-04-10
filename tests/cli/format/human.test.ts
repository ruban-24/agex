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
  formatTaskStartHuman,
  formatTaskStopHuman,
  formatErrorHuman,
  formatRetryHuman,
  formatRetryDryRunHuman,
  formatRespondHuman,
} from '../../../src/cli/format/human.js';
import type { TaskRecord } from '../../../src/types.js';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'abc123',
    prompt: 'Fix the login bug',
    status: 'completed',
    branch: 'agex/abc123',
    worktree: '.agex/tasks/abc123',
    created_at: '2026-04-09T00:00:00Z',
    env: {
      AGEX_TASK_ID: 'abc123',
      AGEX_WORKTREE: '/tmp/test/.agex/tasks/abc123',
      AGEX_PORT: '3100',
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
    expect(result).toContain('agex/abc123');
    expect(result).toContain('VERIFICATION');
    expect(result).toContain('npm test');
  });

  it('shows next action hint for completed task', () => {
    const task = makeTask({ status: 'completed' });
    const result = stripAnsi(formatStatusHuman(task, ''));
    expect(result).toContain('agex merge abc123');
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
      branch: 'agex/abc123',
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
    expect(result).toContain('agex/abc123');
    expect(result).not.toContain('git diff main');
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
        { id: 'aaa', prompt: 'Fix bug', status: 'completed', duration_s: 45, checks_passed: 3, checks_total: 3, files_changed: 2, insertions: 42, deletions: 8 },
        { id: 'bbb', prompt: 'Refactor', status: 'failed', duration_s: 23, checks_passed: 1, checks_total: 3, files_changed: 4, insertions: 15, deletions: 2 },
      ],
    };
    const result = stripAnsi(formatCompareHuman(data));
    expect(result).toContain('aaa');
    expect(result).toContain('bbb');
    expect(result).toContain('2 tasks');
    expect(result).toContain('Duration');
    expect(result).toContain('45s');
  });
});

describe('action formatters', () => {
  it('formatInitHuman shows confirmation and next action', () => {
    const result = stripAnsi(formatInitHuman({
      created: true,
      files: ['.agex/config.yml', '.claude/skills/agex/SKILL.md'],
      verify: ['npm test'],
      agents: ['claude-code'],
    }));
    expect(result).toContain('Initialized');
    expect(result).toContain('.agex/config.yml');
    expect(result).toContain('.claude/skills/agex/SKILL.md');
    expect(result).toContain('Try:');
    expect(result).toContain('agex');
  });

  it('formatInitHuman shows minimal output with no files', () => {
    const result = stripAnsi(formatInitHuman({
      created: true,
      files: [],
      verify: [],
      agents: [],
    }));
    expect(result).toContain('Initialized');
    expect(result).not.toContain('Created:');
    expect(result).toContain('start your agent');
  });

  it('formatTaskCreateHuman shows task card', () => {
    const task = makeTask({ status: 'ready' });
    const result = stripAnsi(formatTaskCreateHuman(task));
    expect(result).toContain('Created task abc123');
    expect(result).toContain('agex task exec');
  });

  it('formatMergeHuman shows merge result with target branch', () => {
    const result = stripAnsi(formatMergeHuman({ id: 'abc123', merged: true, strategy: 'fast-forward', commit: 'bae224d', targetBranch: 'main' }));
    expect(result).toContain('Merged abc123');
    expect(result).toContain('into main');
    expect(result).toContain('fast-forward');
    expect(result).toContain('agex clean');
  });

  it('formatMergeHuman falls back to current branch when targetBranch missing', () => {
    const result = stripAnsi(formatMergeHuman({ id: 'abc123', merged: true, strategy: 'fast-forward', commit: 'bae224d' }));
    expect(result).toContain('Merged abc123');
    expect(result).toContain('into current branch');
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
    expect(result).toContain('agex diff');
  });

  it('formatTaskExecHuman shows running task for non-blocking', () => {
    const task = makeTask({ status: 'running', pid: 12345 });
    const result = stripAnsi(formatTaskExecHuman(task));
    expect(result).toContain('running');
    expect(result).toContain('pid: 12345');
  });
});

describe('formatTaskStartHuman', () => {
  it('shows server started with url and pid', () => {
    const result = stripAnsi(formatTaskStartHuman({
      id: 'abc123',
      port: 3100,
      url: 'http://localhost:3100',
      server_running: true,
      server_pid: 12345,
    }));
    expect(result).toContain('Server started');
    expect(result).toContain('http://localhost:3100');
    expect(result).toContain('12345');
  });

  it('includes warning when present', () => {
    const result = stripAnsi(formatTaskStartHuman({
      id: 'abc123',
      port: 3100,
      url: 'http://localhost:3100',
      server_running: true,
      server_pid: 12345,
      warning: '4 servers running — consider stopping idle ones',
    }));
    expect(result).toContain('4 servers running');
  });
});

describe('formatTaskStopHuman', () => {
  it('shows server stopped', () => {
    const result = stripAnsi(formatTaskStopHuman({
      id: 'abc123',
      server_running: false,
    }));
    expect(result).toContain('Server stopped');
  });
});

describe('formatErrorHuman', () => {
  it('formats error as plain text', () => {
    const result = stripAnsi(formatErrorHuman('Task not found: xyz'));
    expect(result).toContain('✗');
    expect(result).toContain('Task not found: xyz');
  });

  it('includes suggestion hint line when provided', () => {
    const result = stripAnsi(formatErrorHuman('Task not found: abc123', "Run 'agex list' to see available tasks"));
    expect(result).toContain('✗');
    expect(result).toContain('Task not found: abc123');
    expect(result).toContain('→');
    expect(result).toContain("Run 'agex list' to see available tasks");
  });

  it('omits suggestion line when not provided', () => {
    const result = stripAnsi(formatErrorHuman('Something went wrong'));
    expect(result).toContain('Something went wrong');
    expect(result).not.toContain('→');
  });
});

describe('v0.2.0 formatters', () => {
  it('formatRetryDryRunHuman shows prompt preview', () => {
    const result = stripAnsi(formatRetryDryRunHuman('original prompt\n\n## Feedback\nfix it'));
    expect(result).toContain('RETRY PROMPT PREVIEW');
    expect(result).toContain('original prompt');
    expect(result).toContain('fix it');
    expect(result).toContain('No task created');
  });

  it('formatRespondHuman shows confirmation', () => {
    const task = {
      id: 'abc123',
      prompt: 'test',
      status: 'running' as const,
      branch: 'agex/abc123',
      worktree: '.agex/tasks/abc123',
      created_at: new Date().toISOString(),
      env: { AGEX_TASK_ID: 'abc123', AGEX_WORKTREE: '.agex/tasks/abc123', AGEX_PORT: '3001' },
    };
    const result = formatRespondHuman(task);
    expect(result).toContain('Answer saved');
    expect(result).toContain('abc123');
  });

  it('formatRetryHuman shows retry info', () => {
    const task = {
      id: 'def456',
      prompt: 'retry task',
      status: 'running' as const,
      branch: 'agex/def456',
      worktree: '.agex/tasks/def456',
      created_at: new Date().toISOString(),
      env: { AGEX_TASK_ID: 'def456', AGEX_WORKTREE: '.agex/tasks/def456', AGEX_PORT: '3002' },
      retriedFrom: 'abc123',
      retryDepth: 1,
    };
    const result = formatRetryHuman(task);
    expect(result).toContain('Retry created');
    expect(result).toContain('def456');
    expect(result).toContain('abc123');
  });
});

import { describe, it, expect } from 'vitest';
import { formatActivityHuman } from '../../../src/cli/format/activity.js';
import { stripAnsi } from '../../../src/cli/format/colors.js';
import type { ActivityResult } from '../../../src/cli/commands/activity.js';

function makeResult(events: Array<{ event: string; data?: Record<string, unknown> }>): ActivityResult {
  return {
    id: 'abc123',
    empty: events.length === 0,
    events: events.map((e, i) => ({
      ts: `2026-04-16T10:30:${String(i).padStart(2, '0')}.000Z`,
      event: e.event as any,
      task_id: 'abc123',
      ...(e.data && { data: e.data }),
    })),
  };
}

describe('formatActivityHuman', () => {
  it('includes task ID in header', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug', branch: 'agex/abc123' } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('abc123');
  });

  it('shows prompt from task.created in header', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix the auth bug', branch: 'agex/abc123' } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('Fix the auth bug');
  });

  it('renders lifecycle events with bullet symbol', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug', branch: 'agex/abc123' } },
      { event: 'task.provisioned', data: { copies: ['.env'] } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('task.created');
    expect(output).toContain('task.provisioned');
  });

  it('renders tool.call events on single lines with tool name and key detail', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'tool.call', data: { tool: 'Read', file_path: 'src/main.ts' } },
      { event: 'tool.call', data: { tool: 'Bash', command: 'npm test' } },
      { event: 'tool.call', data: { tool: 'Grep', pattern: 'TODO', path: 'src/' } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('Read');
    expect(output).toContain('src/main.ts');
    expect(output).toContain('Bash');
    expect(output).toContain('npm test');
    expect(output).toContain('Grep');
    expect(output).toContain('TODO');
  });

  it('renders tool.failed events with error cross', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'tool.failed', data: { tool: 'Edit', file_path: 'src/main.ts', error: 'old_string not found' } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('Edit');
    expect(output).toContain('old_string not found');
  });

  it('renders verification results with pass/fail symbols', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'task.verify', data: {
        passed: true,
        summary: '3/3 checks passed',
        checks: [
          { cmd: 'tsc --noEmit', passed: true, duration_s: 0.8 },
          { cmd: 'vitest run', passed: true, duration_s: 1.2 },
          { cmd: 'eslint .', passed: true, duration_s: 0.5 },
        ],
      }},
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('PASSED');
    expect(output).toContain('tsc --noEmit');
    expect(output).toContain('vitest run');
  });

  it('renders session.end with token usage in footer', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'session.end', data: {
        tokens: { input_tokens: 12450, output_tokens: 3200, cache_read_tokens: 8100, cache_creation_tokens: 4350 },
        api_calls: 12,
        turns: 3,
        files_modified: ['src/auth.ts', 'src/auth.test.ts'],
      }},
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('12,450');
    expect(output).toContain('3,200');
    expect(output).toContain('src/auth.ts');
  });

  it('renders model from session.start in header', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'session.start', data: { model: 'claude-opus-4-6' } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('claude-opus-4-6');
  });

  it('renders Agent tool calls with description', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'tool.call', data: { tool: 'Agent', description: 'Explore codebase', subagent_type: 'Explore' } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('Agent');
    expect(output).toContain('Explore codebase');
  });

  it('renders task.finished with exit code and diff stats', () => {
    const result = makeResult([
      { event: 'task.created', data: { prompt: 'Fix bug' } },
      { event: 'task.finished', data: { exit_code: 0, duration_s: 45, diff_stats: { files_changed: 2, insertions: 15, deletions: 8 } } },
    ]);
    const output = stripAnsi(formatActivityHuman(result));
    expect(output).toContain('exit_code: 0');
    expect(output).toContain('45');
  });
});

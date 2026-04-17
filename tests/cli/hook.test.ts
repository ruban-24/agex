import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  routeHookEvent,
  extractHookData,
  processHookPayload,
} from '../../src/cli/commands/hook.js';

describe('routeHookEvent', () => {
  it('extracts taskId from cwd containing /.agex/tasks/<id>/', () => {
    const result = routeHookEvent('/home/user/myrepo/.agex/tasks/abc123/src/main.ts');
    expect(result).toEqual({ repoRoot: '/home/user/myrepo', taskId: 'abc123' });
  });

  it('extracts taskId when cwd is exactly the worktree root', () => {
    const result = routeHookEvent('/home/user/myrepo/.agex/tasks/abc123');
    expect(result).toEqual({ repoRoot: '/home/user/myrepo', taskId: 'abc123' });
  });

  it('returns null when cwd is not inside an agex worktree', () => {
    const result = routeHookEvent('/home/user/myrepo/src');
    expect(result).toBeNull();
  });
});

describe('extractHookData', () => {
  it('post-tool maps to tool.call with extracted tool input', () => {
    const payload = {
      tool: 'Edit',
      tool_use_id: 'tu_001',
      tool_input: {
        file_path: '/src/main.ts',
        old_string: 'foo',
        new_string: 'bar',
      },
    };
    const result = extractHookData('post-tool', payload);
    expect(result).toEqual({
      event: 'tool.call',
      data: {
        tool: 'Edit',
        tool_use_id: 'tu_001',
        file_path: '/src/main.ts',
      },
    });
  });

  it('post-tool-failure maps to tool.failed with error info', () => {
    const payload = {
      tool: 'Bash',
      tool_use_id: 'tu_002',
      tool_input: { command: 'npm test' },
      error: 'Permission denied',
      is_interrupt: false,
    };
    const result = extractHookData('post-tool-failure', payload);
    expect(result).toEqual({
      event: 'tool.failed',
      data: {
        tool: 'Bash',
        tool_use_id: 'tu_002',
        command: 'npm test',
        error: 'Permission denied',
        is_interrupt: false,
      },
    });
  });

  it('turn-end maps to turn.end with empty data', () => {
    const result = extractHookData('turn-end', {});
    expect(result).toEqual({
      event: 'turn.end',
      data: {},
    });
  });

  it('subagent-start maps to subagent.started', () => {
    const payload = {
      agent_id: 'agent_001',
      agent_type: 'task',
    };
    const result = extractHookData('subagent-start', payload);
    expect(result).toEqual({
      event: 'subagent.started',
      data: { agent_id: 'agent_001', agent_type: 'task' },
    });
  });

  it('subagent-stop maps to subagent.completed', () => {
    const payload = {
      agent_id: 'agent_001',
      agent_type: 'task',
      agent_transcript_path: '/tmp/transcript.jsonl',
    };
    const result = extractHookData('subagent-stop', payload);
    expect(result).toEqual({
      event: 'subagent.completed',
      data: {
        agent_id: 'agent_001',
        agent_type: 'task',
        agent_transcript_path: '/tmp/transcript.jsonl',
      },
    });
  });

  it('session-end maps to session.end with empty data', () => {
    const result = extractHookData('session-end', {});
    expect(result).toEqual({
      event: 'session.end',
      data: {},
    });
  });

  it('cwd-changed maps to cwd.changed with cwd', () => {
    const payload = { cwd: '/home/user/myrepo/.agex/tasks/abc123' };
    const result = extractHookData('cwd-changed', payload);
    expect(result).toEqual({
      event: 'cwd.changed',
      data: { cwd: '/home/user/myrepo/.agex/tasks/abc123' },
    });
  });

  it('unknown-event returns null', () => {
    const result = extractHookData('unknown-event', {});
    expect(result).toBeNull();
  });

  it('prompt-submit returns null (reserved for future)', () => {
    const result = extractHookData('prompt-submit', { prompt: 'hello' });
    expect(result).toBeNull();
  });
});

describe('processHookPayload integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-hook-test-'));
    // Create .agex/tasks/ directory structure with a task worktree
    await mkdir(join(tempDir, '.agex', 'tasks', 'abc123'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('appends an activity event for a post-tool payload with cwd inside a worktree', async () => {
    const payload = {
      tool: 'Read',
      tool_use_id: 'tu_100',
      tool_input: { file_path: join(tempDir, '.agex', 'tasks', 'abc123', 'src', 'index.ts') },
      cwd: join(tempDir, '.agex', 'tasks', 'abc123'),
    };

    await processHookPayload('post-tool', payload);

    const activityPath = join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl');
    const content = await readFile(activityPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const event = JSON.parse(lines[0]);
    expect(event.event).toBe('tool.call');
    expect(event.task_id).toBe('abc123');
    expect(event.data.tool).toBe('Read');
    expect(event.data.tool_use_id).toBe('tu_100');
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses file_path fallback when cwd does not match a worktree', async () => {
    const payload = {
      tool: 'Write',
      tool_use_id: 'tu_200',
      tool_input: { file_path: join(tempDir, '.agex', 'tasks', 'abc123', 'src', 'foo.ts'), content: 'hello' },
      cwd: '/some/random/dir',
    };

    await processHookPayload('post-tool', payload);

    const activityPath = join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl');
    const content = await readFile(activityPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const event = JSON.parse(lines[0]);
    expect(event.event).toBe('tool.call');
    expect(event.task_id).toBe('abc123');
  });

  it('silently does nothing when cwd and file_path both do not match', async () => {
    const payload = {
      tool: 'Read',
      tool_use_id: 'tu_300',
      tool_input: { file_path: '/some/other/path/file.ts' },
      cwd: '/some/random/dir',
    };

    // Should not throw
    await processHookPayload('post-tool', payload);

    // No activity file should be created for abc123
    try {
      await readFile(join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl'), 'utf-8');
      expect.fail('Should not have created an activity file');
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('silently does nothing for unknown events', async () => {
    const payload = {
      cwd: join(tempDir, '.agex', 'tasks', 'abc123'),
    };

    // Should not throw
    await processHookPayload('unknown-event', payload);
  });
});

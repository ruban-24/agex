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
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'agex-route-'));
    await mkdir(join(repo, '.agex', 'tasks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  // Tier 1 tests rely on process.env; restore after each test.
  const origTaskId = process.env.AGEX_TASK_ID;
  const origWorktree = process.env.AGEX_WORKTREE;
  beforeEach(() => {
    // Clear before every test so the ambient environment (e.g. when tests
    // themselves run inside an agex worktree) does not leak into tier 1.
    delete process.env.AGEX_TASK_ID;
    delete process.env.AGEX_WORKTREE;
  });
  afterEach(() => {
    if (origTaskId === undefined) delete process.env.AGEX_TASK_ID;
    else process.env.AGEX_TASK_ID = origTaskId;
    if (origWorktree === undefined) delete process.env.AGEX_WORKTREE;
    else process.env.AGEX_WORKTREE = origWorktree;
  });

  it('tier 1 — AGEX_TASK_ID env var dominates even when cwd is elsewhere', () => {
    process.env.AGEX_TASK_ID = 'envtask';
    process.env.AGEX_WORKTREE = join(repo, '.agex', 'tasks', 'envtask');
    const result = routeHookEvent({ cwd: '/tmp' });
    expect(result).toEqual({ repoRoot: repo, taskId: 'envtask' });
  });

  it('tier 1 — AGEX_TASK_ID env var wins over a conflicting cwd', () => {
    process.env.AGEX_TASK_ID = 'envtask';
    process.env.AGEX_WORKTREE = join(repo, '.agex', 'tasks', 'envtask');
    // cwd points to a DIFFERENT task — tier 1 must still win.
    const result = routeHookEvent({ cwd: join(repo, '.agex', 'tasks', 'other') });
    expect(result).toEqual({ repoRoot: repo, taskId: 'envtask' });
  });

  it('tier 1 — skipped when AGEX_TASK_ID disagrees with AGEX_WORKTREE', () => {
    // Defensive: if agex ever sets mismatched vars, fall through to lower tiers.
    process.env.AGEX_TASK_ID = 'alpha';
    process.env.AGEX_WORKTREE = join(repo, '.agex', 'tasks', 'beta');
    delete process.env.AGEX_TASK_ID; // unset one to trigger fallthrough
    const result = routeHookEvent({ cwd: '/tmp' });
    expect(result).toBeNull();
  });

  // --- Spec tests ---

  it('uses tool_input.file_path when AGEX_TASK_ID is not set', () => {
    const filePath = join(repo, '.agex', 'tasks', 'abc123', 'foo.ts');
    const result = routeHookEvent({
      cwd: repo,
      session_id: 'S-ROOT',
      tool_input: { file_path: filePath },
    });
    expect(result).toEqual({ repoRoot: repo, taskId: 'abc123' });
  });

  it('does not write any side-effect files when resolving via tool_input path', async () => {
    const { access } = await import('node:fs/promises');
    const filePath = join(repo, '.agex', 'tasks', 'abc123', 'foo.ts');
    routeHookEvent({
      cwd: repo,
      session_id: 'S-ROOT',
      tool_input: { file_path: filePath },
    });
    await expect(access(join(repo, '.agex', 'sessions.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns null when tier 1 misses and tool_input has no worktree path', () => {
    const result = routeHookEvent({
      cwd: repo,
      tool_input: { url: 'https://example.com' },
    });
    expect(result).toBeNull();
  });

  // The tool_input path tier matches file_path, path, and notebook_path.
  it('tool_input path tier matches file_path, path, and notebook_path keys', () => {
    const filePath = join(repo, '.agex', 'tasks', 'abc123', 'foo.ts');
    const pathField = join(repo, '.agex', 'tasks', 'abc123', 'bar.ts');
    const notebookPath = join(repo, '.agex', 'tasks', 'abc123', 'nb.ipynb');
    const expected = { repoRoot: repo, taskId: 'abc123' };

    expect(routeHookEvent({ cwd: repo, tool_input: { file_path: filePath } })).toEqual(expected);
    expect(routeHookEvent({ cwd: repo, tool_input: { path: pathField } })).toEqual(expected);
    expect(routeHookEvent({ cwd: repo, tool_input: { notebook_path: notebookPath } })).toEqual(expected);
  });

  // Regression: tightened WORKTREE_RE must NOT match sibling metadata files like
  // `.agex/tasks/abc123.json` or `.agex/tasks/abc123.activity.jsonl`.
  it('does not misroute a tool_input path that targets a task metadata file', () => {
    const metaFile = join(repo, '.agex', 'tasks', 'abc123.json');
    const activityFile = join(repo, '.agex', 'tasks', 'abc123.activity.jsonl');
    expect(routeHookEvent({ cwd: '/tmp', tool_input: { file_path: metaFile } })).toBeNull();
    expect(routeHookEvent({ cwd: '/tmp', tool_input: { path: activityFile } })).toBeNull();
  });

  it('does NOT route events whose cwd drifted into a worktree when AGEX_TASK_ID is unset', () => {
    // This is the specific bug that killed the tier-2 cwd routing: a coordinator
    // session's cwd tracking can drift into a worktree (e.g. after agex run), and
    // without AGEX_TASK_ID we must not attribute its events to the task.
    const driftedCwd = join(repo, '.agex', 'tasks', 'abc123');
    // No tool_input path inside the worktree. Primary-checkout path only.
    const primaryPath = join(repo, 'src', 'index.ts');
    const result = routeHookEvent({
      cwd: driftedCwd,
      tool_input: { file_path: primaryPath },
    });
    expect(result).toBeNull();
  });
});

describe('extractHookData', () => {
  it('post-tool maps to tool.call with extracted tool input', () => {
    const payload = {
      tool_name: 'Edit',
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
      tool_name: 'Bash',
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

  // Clear tier-1 env vars so the ambient environment (tests run inside an
  // agex worktree) does not short-circuit routing; restore afterward.
  const origTaskId = process.env.AGEX_TASK_ID;
  const origWorktree = process.env.AGEX_WORKTREE;
  beforeEach(async () => {
    delete process.env.AGEX_TASK_ID;
    delete process.env.AGEX_WORKTREE;
    tempDir = await mkdtemp(join(tmpdir(), 'agex-hook-test-'));
    // Create .agex/tasks/ directory structure with a task worktree
    await mkdir(join(tempDir, '.agex', 'tasks', 'abc123'), { recursive: true });
  });

  afterEach(async () => {
    if (origTaskId === undefined) delete process.env.AGEX_TASK_ID;
    else process.env.AGEX_TASK_ID = origTaskId;
    if (origWorktree === undefined) delete process.env.AGEX_WORKTREE;
    else process.env.AGEX_WORKTREE = origWorktree;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('appends an activity event for a post-tool payload with cwd inside a worktree', async () => {
    const payload = {
      tool_name: 'Read',
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
      tool_name: 'Write',
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
      tool_name: 'Read',
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

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

  // --- Baseline (replacing the old cwd-only tests) ---
  it('returns the route when cwd is inside a worktree', () => {
    const cwd = join(repo, '.agex', 'tasks', 'abc123', 'src');
    const result = routeHookEvent({ cwd });
    expect(result).toEqual({ repoRoot: repo, taskId: 'abc123' });
  });

  it('returns the route when cwd is exactly the worktree root', () => {
    const cwd = join(repo, '.agex', 'tasks', 'abc123');
    const result = routeHookEvent({ cwd });
    expect(result).toEqual({ repoRoot: repo, taskId: 'abc123' });
  });

  // --- Spec tests 1–6 ---

  // 1. Tier 1 (registry) wins when the session is registered.
  it('prefers tier 1 when the registry has the session', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(repo, '.agex', 'sessions.json'),
      JSON.stringify({ 'S1': { taskId: 'from-registry', repoRoot: repo } }),
    );
    // cwd does NOT match a worktree, so tier 2 would miss;
    // but tier 1 resolves first and should pin task-id from the registry.
    const result = routeHookEvent({ cwd: repo, session_id: 'S1' });
    expect(result).toEqual({ repoRoot: repo, taskId: 'from-registry' });
  });

  // 2. Tier 2 (cwd) is used when registry misses, AND it writes to the registry.
  it('uses tier 2 on registry miss and writes session_id -> task into the registry', async () => {
    const { readFile } = await import('node:fs/promises');
    const cwd = join(repo, '.agex', 'tasks', 'abc123', 'src');
    const result = routeHookEvent({ cwd, session_id: 'S-NEW' });
    expect(result).toEqual({ repoRoot: repo, taskId: 'abc123' });
    const raw = await readFile(join(repo, '.agex', 'sessions.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ 'S-NEW': { taskId: 'abc123', repoRoot: repo } });
  });

  // 3. Tier 3 (tool_input path) is used when cwd is outside any worktree.
  it('uses tier 3 (tool_input.file_path) when cwd is outside any worktree', () => {
    const filePath = join(repo, '.agex', 'tasks', 'abc123', 'foo.ts');
    const result = routeHookEvent({
      cwd: repo,
      session_id: 'S-ROOT',
      tool_input: { file_path: filePath },
    });
    expect(result).toEqual({ repoRoot: repo, taskId: 'abc123' });
  });

  // 4. Tier 3 does NOT populate the registry (would be wrong for cross-worktree root sessions).
  it('does not write to the registry when only tier 3 matches', async () => {
    const { access } = await import('node:fs/promises');
    const filePath = join(repo, '.agex', 'tasks', 'abc123', 'foo.ts');
    routeHookEvent({
      cwd: repo,
      session_id: 'S-ROOT',
      tool_input: { file_path: filePath },
    });
    await expect(access(join(repo, '.agex', 'sessions.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  // 5. All tiers miss → null.
  it('returns null when all three tiers miss', () => {
    const result = routeHookEvent({
      cwd: repo,
      session_id: 'S-ROOT',
      tool_input: { url: 'https://example.com' },
    });
    expect(result).toBeNull();
  });

  // 6. Tier 3 matches file_path, path, and notebook_path.
  it('tier 3 matches file_path, path, and notebook_path keys', () => {
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

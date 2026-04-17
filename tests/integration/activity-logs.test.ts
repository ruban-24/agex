import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, mkdir, appendFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ActivityEvent, TaskRecord } from '../../src/types.js';

// ---------- Resolve CLI path ----------
// Find the worktree / repo root by walking up from this file until we find package.json.
// tests/integration/activity-logs.test.ts -> two dirs up is the project root.
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = join(PROJECT_ROOT, 'dist', 'index.js');
const BUILD_SCRIPT = join(PROJECT_ROOT, 'build.js');

// ---------- Helpers ----------

interface AgexResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function agex(cwd: string, args: string[], stdin?: string, extraEnv?: Record<string, string>): AgexResult {
  // Strip AGEX_TASK_ID / AGEX_WORKTREE from the inherited env so tier 1
  // routing doesn't short-circuit to an ambient task when tests themselves
  // run inside an agex worktree. Tests that need tier-1 routing pass the
  // vars via extraEnv to re-enable it deterministically.
  const { AGEX_TASK_ID: _a, AGEX_WORKTREE: _b, ...env } = process.env;
  const res = spawnSync('node', [CLI, ...args], {
    cwd,
    input: stdin,
    encoding: 'utf-8',
    env: { ...env, NO_COLOR: '1', FORCE_COLOR: '0', ...(extraEnv ?? {}) },
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

async function makeRepo(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'agex-activity-test-'));
  execSync('git init -q', { cwd: path });
  execSync('git config user.email "test@test.com"', { cwd: path });
  execSync('git config user.name "Test"', { cwd: path });
  execSync('git config commit.gpgsign false', { cwd: path });
  await writeFile(join(path, 'README.md'), '# Test Repo\n');
  execSync('git add . && git commit -q -m "initial"', { cwd: path });
  return path;
}

async function cleanupRepo(path: string): Promise<void> {
  // Remove any worktrees first
  try {
    const output = execSync('git worktree list --porcelain', { cwd: path, encoding: 'utf-8' });
    const worktrees = output
      .split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', ''))
      .filter(p => p !== path);
    for (const wt of worktrees) {
      try { execSync(`git worktree remove --force "${wt}"`, { cwd: path, stdio: 'ignore' }); } catch {}
    }
  } catch {}
  await rm(path, { recursive: true, force: true });
}

async function initAgex(repo: string, verifyCmd = 'echo ok'): Promise<void> {
  const res = agex(repo, ['init', '--verify', verifyCmd]);
  if (res.status !== 0) {
    throw new Error(`agex init failed: ${res.stderr}\n${res.stdout}`);
  }
  // Commit the .gitignore so working tree is clean for merges
  execSync('git add .gitignore && git commit -q -m "add gitignore"', { cwd: repo });
}

function parseJson<T = unknown>(s: string): T {
  return JSON.parse(s) as T;
}

function readJsonlEvents(text: string): ActivityEvent[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l) as ActivityEvent);
}

async function readActivity(repo: string, taskId: string): Promise<ActivityEvent[]> {
  const file = join(repo, '.agex', 'tasks', `${taskId}.activity.jsonl`);
  const raw = await readFile(file, 'utf-8');
  return readJsonlEvents(raw);
}

async function readTaskJson(repo: string, taskId: string): Promise<TaskRecord> {
  const file = join(repo, '.agex', 'tasks', `${taskId}.json`);
  return parseJson<TaskRecord>(await readFile(file, 'utf-8'));
}

async function createTask(repo: string, prompt: string): Promise<string> {
  const res = agex(repo, ['create', '--prompt', prompt]);
  if (res.status !== 0) throw new Error(`create failed: ${res.stderr}\n${res.stdout}`);
  // First JSON object on stdout is the task record; a trailing firstRun object may follow.
  // commander/output.formatOutput writes compact JSON so it should be one line.
  const firstLine = res.stdout.split('\n').find(l => l.trim().startsWith('{'));
  if (!firstLine) throw new Error(`unexpected stdout: ${res.stdout}`);
  const task = parseJson<TaskRecord>(firstLine);
  return task.id;
}

async function execTask(repo: string, id: string, cmd: string): Promise<AgexResult> {
  return agex(repo, ['exec', id, '--cmd', cmd, '--wait']);
}

async function pathExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

// ---------- Tests ----------

beforeAll(() => {
  if (!existsSync(CLI)) {
    // Build dist once before running the suite (avoid shell interpolation)
    const buildRes = spawnSync('node', [BUILD_SCRIPT], { cwd: PROJECT_ROOT, stdio: 'ignore' });
    if (buildRes.status !== 0) {
      throw new Error(`dist build failed with status ${buildRes.status}`);
    }
  }
}, 60_000);

describe('Task Activity Logs (integration)', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await makeRepo();
  });

  afterEach(async () => {
    await cleanupRepo(repo);
  });

  // ---------------- A. Lifecycle events ----------------
  describe('A. Lifecycle events via create -> exec -> verify', () => {
    it('1. create emits task.created with prompt, branch, worktree', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'add greeting feature');
      const events = await readActivity(repo, id);
      const created = events.find(e => e.event === 'task.created');
      expect(created).toBeDefined();
      expect(created!.data!.prompt).toBe('add greeting feature');
      expect(typeof created!.data!.branch).toBe('string');
      expect(typeof created!.data!.worktree).toBe('string');
    });

    it('2. create emits task.provisioned', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'feature A');
      const events = await readActivity(repo, id);
      expect(events.some(e => e.event === 'task.provisioned')).toBe(true);
    });

    it('3. create emits task.status_change pending->provisioning->ready', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'feature B');
      const events = await readActivity(repo, id);
      const changes = events
        .filter(e => e.event === 'task.status_change')
        .map(e => `${e.data!.from}->${e.data!.to}`);
      expect(changes).toContain('pending->provisioning');
      expect(changes).toContain('provisioning->ready');
    });

    it('4. exec --wait emits task.exec.started with cmd', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'exec test');
      await execTask(repo, id, 'echo done');
      const events = await readActivity(repo, id);
      const started = events.find(e => e.event === 'task.exec.started');
      expect(started).toBeDefined();
      expect(started!.data!.cmd).toBe('echo done');
    });

    it('5. exec completion emits task.finished with exit_code and duration_s', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'finish test');
      await execTask(repo, id, 'echo done');
      const events = await readActivity(repo, id);
      const finished = events.find(e => e.event === 'task.finished');
      expect(finished).toBeDefined();
      expect(finished!.data!.exit_code).toBe(0);
      // Regression (PR #45): task.finished must have a real numeric duration_s.
      // Previously this was emitted BEFORE updateStatus computed duration_s,
      // so the field was always undefined.
      expect(typeof finished!.data!.duration_s).toBe('number');
      expect(finished!.data!.duration_s as number).toBeGreaterThanOrEqual(0);
    });

    it('6. verify emits task.verify with passed, summary, checks', async () => {
      await initAgex(repo, 'echo ok');
      const id = await createTask(repo, 'verify test');
      // make a commit so verify has something to check
      const wt = join(repo, '.agex', 'tasks', id);
      await writeFile(join(wt, 'file.txt'), 'hi\n');
      execSync('git add . && git commit -q -m "add file"', { cwd: wt });

      const res = agex(repo, ['verify', id]);
      expect(res.status).toBe(0);

      const events = await readActivity(repo, id);
      const verifyEvt = events.find(e => e.event === 'task.verify');
      expect(verifyEvt).toBeDefined();
      expect(verifyEvt!.data!.passed).toBe(true);
      expect(typeof verifyEvt!.data!.summary).toBe('string');
      expect(Array.isArray(verifyEvt!.data!.checks)).toBe(true);
    });

    it('7. exec emits status_change running->verifying->completed', async () => {
      await initAgex(repo, 'echo ok');
      const id = await createTask(repo, 'status changes');
      await execTask(repo, id, 'echo done');
      const events = await readActivity(repo, id);
      const changes = events
        .filter(e => e.event === 'task.status_change')
        .map(e => `${e.data!.from}->${e.data!.to}`);
      expect(changes).toContain('ready->running');
      expect(changes).toContain('running->verifying');
      expect(changes).toContain('verifying->completed');
    });

    it('30. answer completion emits task.finished after task.answer', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'answer finish test');

      // First exec: agent writes needs-input.json and exits, task parks at needs-input.
      // needs-input path does NOT emit task.finished, so the only task.finished in the
      // log must come from the answer-path completion.
      await execTask(
        repo,
        id,
        "mkdir -p .agex && echo '{\"question\":\"pick?\"}' > .agex/needs-input.json",
      );
      const paused = await readTaskJson(repo, id);
      expect(paused.status).toBe('needs-input');

      const ans = agex(repo, ['answer', id, '--text', 'option-a', '--cmd', 'echo answered', '--wait']);
      expect(ans.status).toBe(0);

      const events = await readActivity(repo, id);
      const answerIdx = events.findIndex(e => e.event === 'task.answer');
      expect(answerIdx).toBeGreaterThan(-1);
      // task.finished must appear AFTER task.answer — the regression being guarded
      // is that the answer path used to skip this emission entirely.
      const finishedAfterAnswer = events.slice(answerIdx + 1).find(e => e.event === 'task.finished');
      expect(finishedAfterAnswer).toBeDefined();
      expect(finishedAfterAnswer!.data!.exit_code).toBe(0);
      expect(typeof finishedAfterAnswer!.data!.duration_s).toBe('number');
      expect(finishedAfterAnswer!.data!.duration_s as number).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------- B. activity command output ----------------
  describe('B. agex activity command output', () => {
    it('8. activity <id> outputs valid JSONL with ts, event, task_id', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'jsonl test');
      const res = agex(repo, ['activity', id]);
      expect(res.status).toBe(0);
      const lines = res.stdout.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const ev = parseJson<ActivityEvent>(line);
        expect(typeof ev.ts).toBe('string');
        expect(typeof ev.event).toBe('string');
        expect(ev.task_id).toBe(id);
      }
    });

    it('9. activity <id> --human outputs formatted text with header/timeline/timestamps', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'human test');
      const res = agex(repo, ['activity', id, '--human']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain(id);
      expect(res.stdout.toLowerCase()).toContain('timeline');
      // timestamps in HH:MM:SS format
      expect(res.stdout).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('10. activity <nonexistent> --human prints No activity recorded', async () => {
      await initAgex(repo);
      const res = agex(repo, ['activity', 'does-not-exist', '--human']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('No activity recorded');
    });

    it('11. activity (no id) inside worktree cwd infers the task ID', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'infer test');
      const wt = join(repo, '.agex', 'tasks', id);
      const res = agex(wt, ['activity']);
      expect(res.status).toBe(0);
      const lines = res.stdout.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      const first = parseJson<ActivityEvent>(lines[0]);
      expect(first.task_id).toBe(id);
    });
  });

  // ---------------- C. agex hook command routing ----------------
  describe('C. agex hook command routing', () => {
    async function setupWorktreeDir(id: string): Promise<void> {
      await mkdir(join(repo, '.agex', 'tasks', id), { recursive: true });
    }

    it('12. post-tool with AGEX_TASK_ID env appends tool.call (reads tool_name)', async () => {
      await initAgex(repo);
      const id = 'abc123';
      await setupWorktreeDir(id);
      const payload = JSON.stringify({
        cwd: join(repo, '.agex', 'tasks', id, 'src'),
        tool_name: 'Read',
        tool_input: { file_path: 'x.ts' },
        tool_use_id: 'tu1',
      });
      const workerEnv = {
        AGEX_TASK_ID: id,
        AGEX_WORKTREE: join(repo, '.agex', 'tasks', id),
      };
      const res = agex(repo, ['hook', 'post-tool'], payload, workerEnv);
      expect(res.status).toBe(0);
      const events = await readActivity(repo, id);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('tool.call');
      expect(events[0].data!.tool).toBe('Read');
      expect(events[0].data!.tool_use_id).toBe('tu1');
    });

    it('13. post-tool with cwd outside any worktree writes nothing and exits 0', async () => {
      await initAgex(repo);
      const payload = JSON.stringify({ cwd: '/not/a/worktree' });
      const res = agex(repo, ['hook', 'post-tool'], payload);
      expect(res.status).toBe(0);
      // No activity file should exist for any task
      const tasksDir = join(repo, '.agex', 'tasks');
      const anyJsonl = existsSync(join(tasksDir, 'abc123.activity.jsonl'));
      expect(anyJsonl).toBe(false);
    });

    it('14. post-tool-failure appends tool.failed with tool_name and error', async () => {
      await initAgex(repo);
      const id = 'abc123';
      await setupWorktreeDir(id);
      const payload = JSON.stringify({
        cwd: join(repo, '.agex', 'tasks', id),
        tool_name: 'Edit',
        tool_input: { file_path: 'x.ts' },
        tool_use_id: 'tu1',
        error: 'not found',
        is_interrupt: false,
      });
      const workerEnv = {
        AGEX_TASK_ID: id,
        AGEX_WORKTREE: join(repo, '.agex', 'tasks', id),
      };
      const res = agex(repo, ['hook', 'post-tool-failure'], payload, workerEnv);
      expect(res.status).toBe(0);
      const events = await readActivity(repo, id);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('tool.failed');
      expect(events[0].data!.tool).toBe('Edit');
      expect(events[0].data!.error).toBe('not found');
    });

    it('15. turn-end writes turn.end event', async () => {
      await initAgex(repo);
      const id = 'abc123';
      await setupWorktreeDir(id);
      const payload = JSON.stringify({ cwd: join(repo, '.agex', 'tasks', id) });
      const workerEnv = {
        AGEX_TASK_ID: id,
        AGEX_WORKTREE: join(repo, '.agex', 'tasks', id),
      };
      const res = agex(repo, ['hook', 'turn-end'], payload, workerEnv);
      expect(res.status).toBe(0);
      const events = await readActivity(repo, id);
      expect(events.some(e => e.event === 'turn.end')).toBe(true);
    });

    it('16. session-end writes session.end event', async () => {
      await initAgex(repo);
      const id = 'abc123';
      await setupWorktreeDir(id);
      const payload = JSON.stringify({ cwd: join(repo, '.agex', 'tasks', id) });
      const workerEnv = {
        AGEX_TASK_ID: id,
        AGEX_WORKTREE: join(repo, '.agex', 'tasks', id),
      };
      const res = agex(repo, ['hook', 'session-end'], payload, workerEnv);
      expect(res.status).toBe(0);
      const events = await readActivity(repo, id);
      expect(events.some(e => e.event === 'session.end')).toBe(true);
    });

    it('17. cwd-changed writes cwd.changed event', async () => {
      await initAgex(repo);
      const id = 'abc123';
      await setupWorktreeDir(id);
      const payload = JSON.stringify({ cwd: join(repo, '.agex', 'tasks', id, 'src') });
      const workerEnv = {
        AGEX_TASK_ID: id,
        AGEX_WORKTREE: join(repo, '.agex', 'tasks', id),
      };
      const res = agex(repo, ['hook', 'cwd-changed'], payload, workerEnv);
      expect(res.status).toBe(0);
      const events = await readActivity(repo, id);
      const evt = events.find(e => e.event === 'cwd.changed');
      expect(evt).toBeDefined();
      expect(evt!.data!.cwd).toBe(join(repo, '.agex', 'tasks', id, 'src'));
    });

    it('29. tier 3 — absolute worktree file_path from root cwd lands in the task log', async () => {
      await initAgex(repo);
      const id = 'rootedit';
      await setupWorktreeDir(id);
      const absoluteFilePath = join(repo, '.agex', 'tasks', id, 'src', 'foo.ts');
      const payload = JSON.stringify({
        cwd: repo,                 // root session — no worktree in cwd
        session_id: 'S-ROOT',
        tool_name: 'Edit',
        tool_input: { file_path: absoluteFilePath, old_string: 'a', new_string: 'b' },
        tool_use_id: 'tu-root-1',
      });
      const res = agex(repo, ['hook', 'post-tool'], payload);
      expect(res.status).toBe(0);

      const events = await readActivity(repo, id);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('tool.call');
      expect(events[0].task_id).toBe(id);
      expect(events[0].data!.tool).toBe('Edit');
      expect(events[0].data!.tool_use_id).toBe('tu-root-1');

      // No registry side-effects — routing is now pure.
      const registryPath = join(repo, '.agex', 'sessions.json');
      expect(existsSync(registryPath)).toBe(false);
    });
  });

  // ---------------- D. Activity log cleanup ----------------
  describe('D. Activity log cleanup', () => {
    it('18. reject preserves .activity.jsonl', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'reject test');
      const activityFile = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      expect(await pathExists(activityFile)).toBe(true);

      const res = agex(repo, ['reject', id]);
      expect(res.status).toBe(0);

      // Worktree gone, log preserved
      expect(await pathExists(join(repo, '.agex', 'tasks', id))).toBe(false);
      expect(await pathExists(activityFile)).toBe(true);
    });

    it('19. clean after reject deletes the .activity.jsonl along with task JSON', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'clean test');
      agex(repo, ['reject', id]);

      const activityFile = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      const taskFile = join(repo, '.agex', 'tasks', `${id}.json`);
      expect(await pathExists(activityFile)).toBe(true);
      expect(await pathExists(taskFile)).toBe(true);

      const res = agex(repo, ['clean']);
      expect(res.status).toBe(0);
      expect(await pathExists(taskFile)).toBe(false);
      expect(await pathExists(activityFile)).toBe(false);
    });
  });

  // ---------------- E. Lazy aggregation ----------------
  describe('E. Lazy aggregation', () => {
    it('20. activity populates token_usage/model/turn_count/files_modified on task JSON', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'aggregate test');

      // Append synthetic session.end and a tool.call + turn.end to the activity log
      const activityFile = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      const now = new Date().toISOString();
      const synth = [
        { ts: now, event: 'session.start', task_id: id, data: { model: 'claude-opus-4' } },
        { ts: now, event: 'tool.call', task_id: id, data: { tool: 'Edit', file_path: 'foo.ts', tool_use_id: 'tu1' } },
        { ts: now, event: 'turn.end', task_id: id, data: {} },
        {
          ts: now,
          event: 'session.end',
          task_id: id,
          data: {
            tokens: { input_tokens: 100, output_tokens: 50, cache_creation_tokens: 10, cache_read_tokens: 20 },
            api_calls: 3,
          },
        },
      ].map(e => JSON.stringify(e)).join('\n') + '\n';
      await appendFile(activityFile, synth);

      // Clear any preexisting summary fields on the task so aggregation will run
      const taskFile = join(repo, '.agex', 'tasks', `${id}.json`);
      const before = parseJson<TaskRecord>(await readFile(taskFile, 'utf-8'));
      delete before.token_usage;
      delete before.model;
      delete before.turn_count;
      delete before.files_modified;
      await writeFile(taskFile, JSON.stringify(before, null, 2));

      const res = agex(repo, ['activity', id]);
      expect(res.status).toBe(0);

      const after = await readTaskJson(repo, id);
      expect(after.token_usage).toBeDefined();
      expect(after.token_usage!.input_tokens).toBe(100);
      expect(after.token_usage!.output_tokens).toBe(50);
      expect(after.model).toBe('claude-opus-4');
      expect(after.turn_count).toBe(1);
      expect(after.files_modified).toContain('foo.ts');
    });

    it('21. status also triggers lazy aggregation', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'status aggregate test');
      const activityFile = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      const now = new Date().toISOString();
      const synth = [
        { ts: now, event: 'session.start', task_id: id, data: { model: 'claude-sonnet-4' } },
        {
          ts: now,
          event: 'session.end',
          task_id: id,
          data: {
            tokens: { input_tokens: 7, output_tokens: 3, cache_creation_tokens: 0, cache_read_tokens: 0 },
            api_calls: 1,
          },
        },
      ].map(e => JSON.stringify(e)).join('\n') + '\n';
      await appendFile(activityFile, synth);

      const taskFile = join(repo, '.agex', 'tasks', `${id}.json`);
      const before = parseJson<TaskRecord>(await readFile(taskFile, 'utf-8'));
      delete before.token_usage;
      delete before.model;
      await writeFile(taskFile, JSON.stringify(before, null, 2));
      expect((await readTaskJson(repo, id)).token_usage).toBeUndefined();

      const res = agex(repo, ['status', id]);
      expect(res.status).toBe(0);

      const after = await readTaskJson(repo, id);
      expect(after.token_usage).toBeDefined();
      expect(after.token_usage!.input_tokens).toBe(7);
      expect(after.model).toBe('claude-sonnet-4');
    });

    it('31. first status call returns aggregated fields in its response body', async () => {
      // Regression: after the lazy-aggregation write, the command used to return the
      // pre-aggregation task snapshot, so the first `agex status` response omitted
      // token_usage/model/turn_count/files_modified even though they had just been
      // persisted. Second call would return them; first would not.
      await initAgex(repo);
      const id = await createTask(repo, 'first-call aggregate test');
      const activityFile = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      const now = new Date().toISOString();
      const synth = [
        { ts: now, event: 'session.start', task_id: id, data: { model: 'claude-haiku-4' } },
        {
          ts: now,
          event: 'session.end',
          task_id: id,
          data: {
            tokens: { input_tokens: 42, output_tokens: 21, cache_creation_tokens: 0, cache_read_tokens: 0 },
            api_calls: 1,
          },
        },
      ].map(e => JSON.stringify(e)).join('\n') + '\n';
      await appendFile(activityFile, synth);

      const taskFile = join(repo, '.agex', 'tasks', `${id}.json`);
      const before = parseJson<TaskRecord>(await readFile(taskFile, 'utf-8'));
      delete before.token_usage;
      delete before.model;
      await writeFile(taskFile, JSON.stringify(before, null, 2));

      const res = agex(repo, ['status', id]);
      expect(res.status).toBe(0);
      const firstLine = res.stdout.split('\n').find(l => l.trim().startsWith('{'));
      expect(firstLine).toBeDefined();
      const status = parseJson<TaskRecord>(firstLine!);
      expect(status.token_usage).toBeDefined();
      expect(status.token_usage!.input_tokens).toBe(42);
      expect(status.model).toBe('claude-haiku-4');
    });
  });

  // ---------------- F. Skill-writer / init hooks ----------------
  describe('F. Skill-writer / init hooks', () => {
    async function readSettings(): Promise<Record<string, unknown>> {
      const path = join(repo, '.claude', 'settings.local.json');
      return parseJson<Record<string, unknown>>(await readFile(path, 'utf-8'));
    }

    it('22. init --verify installs activity hooks (PostToolUse, Stop, SubagentStart/Stop, SessionEnd, CwdChanged)', async () => {
      const res = agex(repo, ['init', '--verify', 'echo ok']);
      expect(res.status).toBe(0);
      const settings = await readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks).toBeDefined();
      for (const name of ['PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd', 'CwdChanged']) {
        expect(Array.isArray(hooks[name])).toBe(true);
        // Verify the agex hook command is present
        const flat = JSON.stringify(hooks[name]);
        expect(flat).toContain('agex hook');
      }
    });

    it('23. init twice does NOT duplicate hooks (idempotency)', async () => {
      expect(agex(repo, ['init', '--verify', 'echo ok']).status).toBe(0);
      const firstRaw = await readFile(join(repo, '.claude', 'settings.local.json'), 'utf-8');
      const first = parseJson<Record<string, unknown>>(firstRaw);
      const firstHooks = first.hooks as Record<string, unknown[]>;
      const firstCounts = Object.fromEntries(
        Object.entries(firstHooks).map(([k, v]) => [k, (v as unknown[]).length]),
      );

      expect(agex(repo, ['init', '--verify', 'echo ok']).status).toBe(0);
      const secondRaw = await readFile(join(repo, '.claude', 'settings.local.json'), 'utf-8');
      const second = parseJson<Record<string, unknown>>(secondRaw);
      const secondHooks = second.hooks as Record<string, unknown[]>;
      const secondCounts = Object.fromEntries(
        Object.entries(secondHooks).map(([k, v]) => [k, (v as unknown[]).length]),
      );

      expect(secondCounts).toEqual(firstCounts);
    });

    it('24. SessionStart hook command contains systemMessage and jq', async () => {
      const res = agex(repo, ['init', '--verify', 'echo ok', '--agents', 'claude-code']);
      expect(res.status).toBe(0);
      const settings = await readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      const sessionStart = hooks.SessionStart as Array<Record<string, unknown>>;
      expect(sessionStart).toBeDefined();
      const flat = JSON.stringify(sessionStart);
      expect(flat).toContain('systemMessage');
      expect(flat).toContain('jq');
    });

    it('25. No UserPromptSubmit hook is installed', async () => {
      expect(agex(repo, ['init', '--verify', 'echo ok']).status).toBe(0);
      const settings = await readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.UserPromptSubmit).toBeUndefined();
    });
  });

  // ---------------- G. Edge cases ----------------
  describe('G. Edge cases', () => {
    it('26. empty activity file: --human says No activity recorded; JSON mode yields no JSONL lines', async () => {
      await initAgex(repo);
      const id = 'emptyXYZ';
      // Create empty activity file directly — no task JSON needed for activity read,
      // but activity command looks up task for lazy aggregation; it tolerates missing.
      const file = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      await writeFile(file, '');

      const human = agex(repo, ['activity', id, '--human']);
      expect(human.status).toBe(0);
      expect(human.stdout).toContain('No activity recorded');

      const json = agex(repo, ['activity', id]);
      expect(json.status).toBe(0);
      // No JSONL event lines; the empty-output path prints a single {id,events:[],empty:true} JSON
      const lines = json.stdout.split('\n').filter(l => l.trim());
      // Either one summary object or zero lines — what matters is no ActivityEvent rows
      for (const line of lines) {
        const parsed = parseJson<Record<string, unknown>>(line);
        // Must not be an ActivityEvent (no 'ts' + 'event' + 'task_id' all at top level)
        const isActivityEvent = 'ts' in parsed && 'event' in parsed && 'task_id' in parsed;
        expect(isActivityEvent).toBe(false);
      }
    });

    it('27. malformed lines in .activity.jsonl are skipped by --human', async () => {
      await initAgex(repo);
      const id = await createTask(repo, 'malformed test');
      const file = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      // Inject a garbage line between valid ones
      await appendFile(file, 'garbage not json\n');
      await appendFile(
        file,
        JSON.stringify({ ts: new Date().toISOString(), event: 'turn.end', task_id: id, data: {} }) + '\n',
      );

      const res = agex(repo, ['activity', id, '--human']);
      expect(res.status).toBe(0);
      // still renders timeline for valid events
      expect(res.stdout.toLowerCase()).toContain('timeline');
      expect(res.stdout).toContain(id);
    });

    it('28. activity log survives accept (merged) and remains readable', async () => {
      await initAgex(repo, 'echo ok');
      const id = await createTask(repo, 'merge test');
      const wt = join(repo, '.agex', 'tasks', id);
      await writeFile(join(wt, 'hello.txt'), 'hi\n');
      execSync('git add . && git commit -q -m "add hello"', { cwd: wt });

      expect(agex(repo, ['verify', id]).status).toBe(0);
      const accept = agex(repo, ['accept', id, '--reviewed']);
      expect(accept.status).toBe(0);

      // activity file should still exist and be readable
      const file = join(repo, '.agex', 'tasks', `${id}.activity.jsonl`);
      expect(await pathExists(file)).toBe(true);

      const res = agex(repo, ['activity', id]);
      expect(res.status).toBe(0);
      const lines = res.stdout.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      // at least task.created survived
      const evts = lines.map(l => parseJson<ActivityEvent>(l));
      expect(evts.some(e => e.event === 'task.created')).toBe(true);
    });
  });
});

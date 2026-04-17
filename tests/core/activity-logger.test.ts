import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ActivityLogger } from '../../src/core/activity-logger.js';

describe('ActivityLogger', () => {
  let tempDir: string;
  let logger: ActivityLogger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-test-'));
    // Create .agex/tasks/ directory structure
    await mkdir(join(tempDir, '.agex', 'tasks'), { recursive: true });
    logger = new ActivityLogger(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('append', () => {
    it('creates the activity file and writes a single JSON line', async () => {
      await logger.append('abc123', 'task.created', { prompt: 'Fix bug' });

      const content = await readFile(
        join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl'),
        'utf-8',
      );
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const event = JSON.parse(lines[0]);
      expect(event.event).toBe('task.created');
      expect(event.task_id).toBe('abc123');
      expect(event.data).toEqual({ prompt: 'Fix bug' });
      expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('appends multiple events as separate lines', async () => {
      await logger.append('abc123', 'task.created', { prompt: 'Fix bug' });
      await logger.append('abc123', 'task.exec.started', { cmd: 'claude', pid: 123 });

      const content = await readFile(
        join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl'),
        'utf-8',
      );
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).event).toBe('task.created');
      expect(JSON.parse(lines[1]).event).toBe('task.exec.started');
    });

    it('omits data field when not provided', async () => {
      await logger.append('abc123', 'session.end');

      const content = await readFile(
        join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl'),
        'utf-8',
      );
      const event = JSON.parse(content.trim());
      expect(event.data).toBeUndefined();
    });
  });

  describe('read', () => {
    it('returns empty array when activity file does not exist', async () => {
      const events = await logger.read('nonexistent');
      expect(events).toEqual([]);
    });

    it('returns parsed events from JSONL file', async () => {
      await logger.append('abc123', 'task.created', { prompt: 'Fix bug' });
      await logger.append('abc123', 'tool.call', { tool: 'Read', file_path: 'src/main.ts' });

      const events = await logger.read('abc123');
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe('task.created');
      expect(events[1].event).toBe('tool.call');
      expect(events[1].data).toEqual({ tool: 'Read', file_path: 'src/main.ts' });
    });

    it('skips malformed JSON lines gracefully', async () => {
      const filePath = join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl');
      await writeFile(
        filePath,
        '{"ts":"2026-01-01T00:00:00Z","event":"task.created","task_id":"abc123"}\n'
        + 'NOT VALID JSON\n'
        + '{"ts":"2026-01-01T00:00:01Z","event":"tool.call","task_id":"abc123","data":{"tool":"Read"}}\n',
      );

      const events = await logger.read('abc123');
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe('task.created');
      expect(events[1].event).toBe('tool.call');
    });

    it('handles empty lines gracefully', async () => {
      const filePath = join(tempDir, '.agex', 'tasks', 'abc123.activity.jsonl');
      await writeFile(
        filePath,
        '{"ts":"2026-01-01T00:00:00Z","event":"task.created","task_id":"abc123"}\n\n\n',
      );

      const events = await logger.read('abc123');
      expect(events).toHaveLength(1);
    });
  });

  describe('exists', () => {
    it('returns false when activity file does not exist', async () => {
      expect(await logger.exists('nonexistent')).toBe(false);
    });

    it('returns true when activity file exists', async () => {
      await logger.append('abc123', 'task.created');
      expect(await logger.exists('abc123')).toBe(true);
    });
  });

  describe('hasToolCalls', () => {
    it('returns false when no tool.call events exist', async () => {
      await logger.append('abc123', 'task.created', { prompt: 'Fix bug' });
      await logger.append('abc123', 'task.exec.started', { cmd: 'claude' });
      expect(await logger.hasToolCalls('abc123')).toBe(false);
    });

    it('returns true when tool.call events exist', async () => {
      await logger.append('abc123', 'task.created', { prompt: 'Fix bug' });
      await logger.append('abc123', 'tool.call', { tool: 'Read' });
      expect(await logger.hasToolCalls('abc123')).toBe(true);
    });

    it('returns false when activity file does not exist', async () => {
      expect(await logger.hasToolCalls('nonexistent')).toBe(false);
    });
  });

  describe('aggregate', () => {
    it('returns null when no activity exists', async () => {
      const result = await logger.aggregate('nonexistent');
      expect(result).toBeNull();
    });

    it('aggregates token usage from session.end events', async () => {
      await logger.append('abc123', 'session.end', {
        tokens: { input_tokens: 100, output_tokens: 50, cache_creation_tokens: 20, cache_read_tokens: 80 },
        api_calls: 5,
      });
      const result = await logger.aggregate('abc123');
      expect(result?.token_usage).toEqual({
        input_tokens: 100, output_tokens: 50, cache_creation_tokens: 20, cache_read_tokens: 80, api_call_count: 5,
      });
    });

    it('collects files modified from tool.call events', async () => {
      await logger.append('abc123', 'tool.call', { tool: 'Edit', file_path: 'src/a.ts' });
      await logger.append('abc123', 'tool.call', { tool: 'Read', file_path: 'src/b.ts' });
      await logger.append('abc123', 'tool.call', { tool: 'Write', file_path: 'src/c.ts' });
      await logger.append('abc123', 'tool.call', { tool: 'Edit', file_path: 'src/a.ts' });
      const result = await logger.aggregate('abc123');
      expect(result?.files_modified).toEqual(expect.arrayContaining(['src/a.ts', 'src/c.ts']));
      expect(result?.files_modified).toHaveLength(2);
    });

    it('counts turns from turn.end events', async () => {
      await logger.append('abc123', 'turn.end', { duration_ms: 5000 });
      await logger.append('abc123', 'turn.end', { duration_ms: 3000 });
      const result = await logger.aggregate('abc123');
      expect(result?.turn_count).toBe(2);
    });

    it('extracts model from session.start', async () => {
      await logger.append('abc123', 'session.start', { model: 'claude-opus-4-6' });
      const result = await logger.aggregate('abc123');
      expect(result?.model).toBe('claude-opus-4-6');
    });
  });
});

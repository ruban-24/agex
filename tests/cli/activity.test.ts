import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { activityCommand } from '../../src/cli/commands/activity.js';
import { ActivityLogger } from '../../src/core/activity-logger.js';

describe('activityCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-activity-'));
    await mkdir(join(tempDir, '.agex', 'tasks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns events array for a task with activity', async () => {
    const logger = new ActivityLogger(tempDir);
    await logger.append('abc123', 'task.created', { prompt: 'Fix bug' });
    await logger.append('abc123', 'tool.call', { tool: 'Read', file_path: 'src/main.ts' });

    const result = await activityCommand(tempDir, 'abc123');
    expect(result.id).toBe('abc123');
    expect(result.events).toHaveLength(2);
    expect(result.events[0].event).toBe('task.created');
    expect(result.events[1].event).toBe('tool.call');
  });

  it('returns empty events for a task with no activity', async () => {
    const result = await activityCommand(tempDir, 'abc123');
    expect(result.id).toBe('abc123');
    expect(result.events).toEqual([]);
    expect(result.empty).toBe(true);
  });
});

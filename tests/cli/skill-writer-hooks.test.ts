import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeSkillFiles, writeActivityHooks } from '../../src/cli/skill-writer.js';

describe('writeSkillFiles — activity hooks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-skill-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('adds activity hooks to claude-code settings.local.json', async () => {
    await writeSkillFiles(tempDir, ['claude-code']);

    const configPath = join(tempDir, '.claude', 'settings.local.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const hooks = config.hooks;

    expect(hooks.SessionStart).toBeDefined();
    expect(hooks.SessionStart.length).toBeGreaterThan(0);

    expect(hooks.PostToolUse).toBeDefined();
    expect(hooks.PostToolUse.length).toBeGreaterThan(0);
    expect(hooks.PostToolUseFailure).toBeDefined();
    expect(hooks.Stop).toBeDefined();
    expect(hooks.SubagentStart).toBeDefined();
    expect(hooks.SubagentStop).toBeDefined();
    expect(hooks.SessionEnd).toBeDefined();
    expect(hooks.CwdChanged).toBeDefined();

    const postToolHook = hooks.PostToolUse[0];
    expect(postToolHook.hooks[0].command).toContain('agex hook post-tool');
  });

  it('does not duplicate activity hooks on second run', async () => {
    await writeSkillFiles(tempDir, ['claude-code']);
    await writeSkillFiles(tempDir, ['claude-code']);

    const configPath = join(tempDir, '.claude', 'settings.local.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    expect(config.hooks.PostToolUse).toHaveLength(1);
    expect(config.hooks.Stop).toHaveLength(1);
  });

  it('SessionStart hook outputs JSON with systemMessage', async () => {
    await writeSkillFiles(tempDir, ['claude-code']);

    const configPath = join(tempDir, '.claude', 'settings.local.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const sessionStartHook = config.hooks.SessionStart[0].hooks[0];

    expect(sessionStartHook.command).toContain('systemMessage');
  });
});

describe('writeActivityHooks — standalone', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-hooks-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('installs activity hooks without requiring writeSkillFiles', async () => {
    const files = await writeActivityHooks(tempDir);

    expect(files).toContain('.claude/settings.local.json');

    const configPath = join(tempDir, '.claude', 'settings.local.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    expect(config.hooks.PostToolUse).toBeDefined();
    expect(config.hooks.Stop).toBeDefined();
    expect(config.hooks.SessionEnd).toBeDefined();
  });

  it('is idempotent', async () => {
    await writeActivityHooks(tempDir);
    await writeActivityHooks(tempDir);

    const configPath = join(tempDir, '.claude', 'settings.local.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    expect(config.hooks.PostToolUse).toHaveLength(1);
  });
});

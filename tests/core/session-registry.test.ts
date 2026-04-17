import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSessionRegistry } from '../../src/core/session-registry.js';

describe('SessionRegistry', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'agex-session-reg-'));
    await mkdir(join(repo, '.agex'), { recursive: true });
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('lookup returns null when registry file does not exist', () => {
    const reg = loadSessionRegistry(repo);
    expect(reg.lookup('session-1')).toBeNull();
  });

  it('lookup returns null for sessions not in the registry', async () => {
    await writeFile(
      join(repo, '.agex', 'sessions.json'),
      JSON.stringify({ 'session-2': { taskId: 't2', repoRoot: repo } }),
    );
    const reg = loadSessionRegistry(repo);
    expect(reg.lookup('session-1')).toBeNull();
  });

  it('lookup returns the entry when the session is registered', async () => {
    await writeFile(
      join(repo, '.agex', 'sessions.json'),
      JSON.stringify({ 'session-1': { taskId: 'task-abc', repoRoot: repo } }),
    );
    const reg = loadSessionRegistry(repo);
    expect(reg.lookup('session-1')).toEqual({ taskId: 'task-abc', repoRoot: repo });
  });

  it('register persists an entry that a subsequent lookup returns', () => {
    const reg = loadSessionRegistry(repo);
    reg.register('s-1', { taskId: 't-1', repoRoot: repo });
    expect(reg.lookup('s-1')).toEqual({ taskId: 't-1', repoRoot: repo });
  });

  it('register is idempotent — re-registering same session is a no-op', () => {
    const reg = loadSessionRegistry(repo);
    reg.register('s-1', { taskId: 't-1', repoRoot: repo });
    reg.register('s-1', { taskId: 't-1', repoRoot: repo });
    // The file should still parse as a single entry.
    const { readFileSync } = require('node:fs');
    const raw = readFileSync(join(repo, '.agex', 'sessions.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed)).toEqual(['s-1']);
  });

  it('register preserves existing entries', () => {
    const reg = loadSessionRegistry(repo);
    reg.register('s-1', { taskId: 't-1', repoRoot: repo });
    reg.register('s-2', { taskId: 't-2', repoRoot: repo });
    expect(reg.lookup('s-1')).toEqual({ taskId: 't-1', repoRoot: repo });
    expect(reg.lookup('s-2')).toEqual({ taskId: 't-2', repoRoot: repo });
  });

  it('lookup treats corrupt JSON as empty', async () => {
    await writeFile(join(repo, '.agex', 'sessions.json'), 'not json {{{');
    const reg = loadSessionRegistry(repo);
    expect(reg.lookup('s-1')).toBeNull();
  });

  it('register recovers from a corrupt file by overwriting it', async () => {
    await writeFile(join(repo, '.agex', 'sessions.json'), 'not json {{{');
    const reg = loadSessionRegistry(repo);
    reg.register('s-1', { taskId: 't-1', repoRoot: repo });
    expect(reg.lookup('s-1')).toEqual({ taskId: 't-1', repoRoot: repo });
  });

  it('emits a stderr warning once when the registry file is corrupt', async () => {
    const { __resetWarningsForTests } = await import('../../src/core/session-registry.js');
    __resetWarningsForTests();

    await writeFile(join(repo, '.agex', 'sessions.json'), 'not json {{{');

    const errs: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown as (chunk: string | Uint8Array) => boolean) =
      ((chunk: string | Uint8Array) => {
        errs.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
        return true;
      }) as typeof process.stderr.write;

    try {
      const reg = loadSessionRegistry(repo);
      reg.lookup('s-1');
      reg.lookup('s-2');
      reg.lookup('s-3');
    } finally {
      process.stderr.write = orig;
    }

    const warnings = errs.filter(e => e.includes('agex') && e.toLowerCase().includes('session'));
    expect(warnings.length).toBe(1);
  });
});

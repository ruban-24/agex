import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { interactiveInit } from '../../src/cli/commands/init-interactive.js';
import type { PromptIO } from '../../src/cli/interactive.js';
import { stripAnsi } from '../../src/cli/format/colors.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

function createMockIO(): PromptIO & { input: PassThrough; output: PassThrough; getOutput: () => string } {
  const input = new PassThrough();
  const output = new PassThrough();
  let outputData = '';
  output.on('data', (chunk: Buffer) => { outputData += chunk.toString(); });
  return { input, output, getOutput: () => outputData };
}

// Key sequences for singleSelect-based confirm
const YES = '\r';           // enter on first option (Yes)
const NO = '\x1b[B\r';     // arrow down to No + enter
const EDIT = '\x1b[B\x1b[B\r'; // arrow down 2x to Edit + enter

describe('interactiveInit', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('detects Node.js project and accepts verify + provisioning + selects agent', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest', lint: 'eslint .' },
      dependencies: { foo: '1.0.0' },
    }));
    await mkdir(join(repo.path, 'node_modules'), { recursive: true });
    await writeFile(join(repo.path, '.env'), 'SECRET=abc');

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: confirm verify commands (Yes)
    setTimeout(() => io.input.write(YES), 50);
    // Prompt 2: confirm provisioning (Yes)
    setTimeout(() => io.input.write(YES), 100);
    // Prompt 3: multi-select agents — space to toggle first (claude-code), enter to confirm
    setTimeout(() => io.input.write(' \r'), 150);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.verify).toEqual(['npm test', 'npm run lint']);
    expect(result.agents).toEqual(['claude-code']);
    expect(result.files).toContain('.agentpod/config.yml');

    const output = stripAnsi(io.getOutput());
    expect(output).toContain('Detected project: Node.js (package.json)');
    expect(output).toContain('npm test');
    expect(output).toContain('npm run lint');
    expect(output).toContain('copy:');
    expect(output).toContain('.env');
    expect(output).toContain('symlink:');
    expect(output).toContain('node_modules');
    expect(output).toContain('setup:');
    expect(output).toContain('npm install');
  });

  it('handles empty project with no markers — editList for verify, no provisioning prompt', async () => {
    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: editList for verify (no auto-detection), enter custom commands
    setTimeout(() => io.input.write('npm test, npm run lint\n'), 50);
    // Prompt 2: multi-select agents — just enter (select none)
    setTimeout(() => io.input.write('\r'), 100);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.verify).toEqual(['npm test', 'npm run lint']);
    expect(result.agents).toEqual([]);

    const output = stripAnsi(io.getOutput());
    expect(output).toContain('No verify commands detected');
    expect(output).not.toContain('Workspace provisioning');
  });

  it('user rejects detected verify commands — verify is empty', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest' },
    }));

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: reject verify commands (No)
    setTimeout(() => io.input.write(NO), 50);
    // Prompt 2: multi-select agents — enter (select none)
    setTimeout(() => io.input.write('\r'), 100);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.verify).toEqual([]);
    expect(result.agents).toEqual([]);
  });

  it('user edits detected verify commands', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest', lint: 'eslint .' },
    }));

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: choose Edit for verify commands
    setTimeout(() => io.input.write(EDIT), 50);
    // Prompt 2: editList — provide new commands
    setTimeout(() => io.input.write('npm test, npm run build\n'), 100);
    // Prompt 3: multi-select agents — enter (select none)
    setTimeout(() => io.input.write('\r'), 150);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.verify).toEqual(['npm test', 'npm run build']);
  });

  it('user selects multiple agents', async () => {
    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: editList for verify (empty project)
    setTimeout(() => io.input.write('\n'), 50);
    // Prompt 2: multi-select — select first (claude-code), arrow down, select second (codex), enter
    setTimeout(() => {
      io.input.write(' ');        // toggle claude-code
      io.input.write('\x1b[B');   // arrow down
      io.input.write(' ');        // toggle codex
      io.input.write('\r');       // confirm
    }, 100);

    const result = await promise;

    expect(result.agents).toEqual(['claude-code', 'codex']);
  });

  it('user rejects provisioning — provisioning fields not in result', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest' },
      dependencies: { foo: '1.0.0' },
    }));

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: accept verify (Yes)
    setTimeout(() => io.input.write(YES), 50);
    // Prompt 2: reject provisioning (No)
    setTimeout(() => io.input.write(NO), 100);
    // Prompt 3: multi-select agents — enter (select none)
    setTimeout(() => io.input.write('\r'), 150);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.verify).toEqual(['npm test']);
    expect(result.files).toContain('.agentpod/config.yml');
  });

  it('displays "Which agents do you use?" heading for agent selection', async () => {
    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Empty project: editList for verify, then agent select
    setTimeout(() => io.input.write('\n'), 50);
    setTimeout(() => io.input.write('\r'), 100);

    await promise;

    const output = stripAnsi(io.getOutput());
    expect(output).toContain('Which agents do you use?');
  });

  it('detects and confirms run config', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { dev: 'next dev' },
    }));

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: confirm verify — no verify detected (no test/lint scripts), editList
    setTimeout(() => io.input.write('\n'), 50);
    // Prompt 2: confirm run config (Yes)
    setTimeout(() => io.input.write(YES), 100);
    // Prompt 3: multi-select agents — enter (select none)
    setTimeout(() => io.input.write('\r'), 150);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.run).toEqual({ cmd: 'npm run dev', port_env: 'PORT' });

    const output = stripAnsi(io.getOutput());
    expect(output).toContain('Dev server');
    expect(output).toContain('npm run dev');
    expect(output).toContain('port_env');
  });

  it('rejects detected run config — run is undefined', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { dev: 'next dev' },
    }));

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: editList for verify (no test/lint scripts)
    setTimeout(() => io.input.write('\n'), 50);
    // Prompt 2: reject run config (No)
    setTimeout(() => io.input.write(NO), 100);
    // Prompt 3: multi-select agents — enter (select none)
    setTimeout(() => io.input.write('\r'), 150);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.run).toBeUndefined();
  });

  it('shows no project type when nothing detected', async () => {
    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    setTimeout(() => io.input.write('\n'), 50);
    setTimeout(() => io.input.write('\r'), 100);

    await promise;

    const output = stripAnsi(io.getOutput());
    expect(output).not.toContain('Detected project:');
  });

  it('edits run config — cmd and port_env', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({
      scripts: { dev: 'next dev' },
    }));

    const io = createMockIO();

    const promise = interactiveInit(repo.path, io);

    // Prompt 1: editList for verify (no test/lint scripts)
    setTimeout(() => io.input.write('\n'), 50);
    // Prompt 2: Edit run config
    setTimeout(() => io.input.write(EDIT), 100);
    // Prompt 3: edit cmd — change it
    setTimeout(() => io.input.write('yarn dev\n'), 150);
    // Prompt 4: edit port_env — keep default (blank enter)
    setTimeout(() => io.input.write('\n'), 200);
    // Prompt 5: multi-select agents — enter (select none)
    setTimeout(() => io.input.write('\r'), 250);

    const result = await promise;

    expect(result.created).toBe(true);
    expect(result.run).toEqual({ cmd: 'yarn dev', port_env: 'PORT' });
  });
});

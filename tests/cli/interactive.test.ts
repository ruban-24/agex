import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { confirm, editList, multiSelect } from '../../src/cli/interactive.js';
import type { PromptIO, SelectOption } from '../../src/cli/interactive.js';

function createMockIO(): PromptIO & { input: PassThrough; output: PassThrough; getOutput: () => string } {
  const input = new PassThrough();
  const output = new PassThrough();
  let outputData = '';
  output.on('data', (chunk: Buffer) => { outputData += chunk.toString(); });
  return { input, output, getOutput: () => outputData };
}

describe('confirm', () => {
  it('returns yes on "y" input', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('y\n');
    expect(await promise).toBe('yes');
  });

  it('returns yes on empty input (default)', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('\n');
    expect(await promise).toBe('yes');
  });

  it('returns no on "n" input', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('n\n');
    expect(await promise).toBe('no');
  });

  it('returns edit on "e" when allowEdit is true', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', { allowEdit: true }, io);
    io.input.write('e\n');
    expect(await promise).toBe('edit');
  });

  it('treats "e" as yes when allowEdit is false', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('e\n');
    expect(await promise).toBe('yes');
  });
});

describe('editList', () => {
  it('returns original items on empty input', async () => {
    const io = createMockIO();
    const promise = editList(['npm test', 'npm run lint'], io);
    io.input.write('\n');
    expect(await promise).toEqual(['npm test', 'npm run lint']);
  });

  it('replaces items with user input when provided', async () => {
    const io = createMockIO();
    const promise = editList(['npm test'], io);
    io.input.write('go test,cargo test\n');
    expect(await promise).toEqual(['go test', 'cargo test']);
  });

  it('trims whitespace and filters empty items', async () => {
    const io = createMockIO();
    const promise = editList([], io);
    io.input.write('  npm test ,,, npm run lint  \n');
    expect(await promise).toEqual(['npm test', 'npm run lint']);
  });
});

describe('multiSelect', () => {
  const options: SelectOption<string>[] = [
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
    { label: 'Option C', value: 'c' },
  ];

  it('returns toggled items after enter', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    io.input.write(' ');
    io.input.write('\r');
    expect(await promise).toEqual(['a']);
  });

  it('can select multiple items', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    io.input.write(' ');
    io.input.write('\x1b[B');
    io.input.write(' ');
    io.input.write('\r');
    expect(await promise).toEqual(['a', 'b']);
  });

  it('returns empty array when none selected', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    io.input.write('\r');
    expect(await promise).toEqual([]);
  });

  it('toggle deselects a selected item', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    io.input.write(' ');
    io.input.write(' ');
    io.input.write('\r');
    expect(await promise).toEqual([]);
  });
});

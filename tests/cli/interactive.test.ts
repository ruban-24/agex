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
    const result = await promise;
    expect(result).toBe('yes');
  });

  it('returns yes on empty input (default)', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('\n');
    const result = await promise;
    expect(result).toBe('yes');
  });

  it('returns no on "n" input', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('n\n');
    const result = await promise;
    expect(result).toBe('no');
  });

  it('returns edit on "e" when allowEdit is true', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', { allowEdit: true }, io);
    io.input.write('e\n');
    const result = await promise;
    expect(result).toBe('edit');
  });

  it('treats "e" as yes when allowEdit is false', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('e\n');
    const result = await promise;
    expect(result).toBe('yes');
  });

  it('displays (y/n/edit) suffix when allowEdit is true', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', { allowEdit: true }, io);
    io.input.write('y\n');
    await promise;
    expect(io.getOutput()).toContain('(y/n/edit)');
  });

  it('displays (y/n) suffix when allowEdit is false', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('y\n');
    await promise;
    expect(io.getOutput()).toContain('(y/n)');
    expect(io.getOutput()).not.toContain('edit');
  });
});

describe('editList', () => {
  it('returns original items on empty input', async () => {
    const io = createMockIO();
    const promise = editList(['npm test', 'npm run lint'], io);
    io.input.write('\n');
    const result = await promise;
    expect(result).toEqual(['npm test', 'npm run lint']);
  });

  it('replaces items with user input when provided', async () => {
    const io = createMockIO();
    const promise = editList(['npm test'], io);
    io.input.write('go test,cargo test\n');
    const result = await promise;
    expect(result).toEqual(['go test', 'cargo test']);
  });

  it('trims whitespace from items', async () => {
    const io = createMockIO();
    const promise = editList([], io);
    io.input.write('  npm test , npm run lint  \n');
    const result = await promise;
    expect(result).toEqual(['npm test', 'npm run lint']);
  });

  it('filters out empty items', async () => {
    const io = createMockIO();
    const promise = editList([], io);
    io.input.write('npm test,,, npm run lint,\n');
    const result = await promise;
    expect(result).toEqual(['npm test', 'npm run lint']);
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
    // Space to select first item, then Enter to confirm
    io.input.write(' ');
    io.input.write('\r');
    const result = await promise;
    expect(result).toEqual(['a']);
  });

  it('can select multiple items', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    // Space to select first, arrow down, space to select second, Enter
    io.input.write(' ');
    io.input.write('\x1b[B'); // arrow down
    io.input.write(' ');
    io.input.write('\r');
    const result = await promise;
    expect(result).toEqual(['a', 'b']);
  });

  it('returns empty array when none selected', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    // Just Enter with no selections
    io.input.write('\r');
    const result = await promise;
    expect(result).toEqual([]);
  });

  it('toggle deselects a selected item', async () => {
    const io = createMockIO();
    const promise = multiSelect(options, io);
    // Space twice (select then deselect), then Enter
    io.input.write(' ');
    io.input.write(' ');
    io.input.write('\r');
    const result = await promise;
    expect(result).toEqual([]);
  });
});

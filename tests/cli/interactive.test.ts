import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { confirm, editField, editList, multiSelect, singleSelect } from '../../src/cli/interactive.js';
import type { PromptIO, SelectOption } from '../../src/cli/interactive.js';

function createMockIO(): PromptIO & { input: PassThrough; output: PassThrough; getOutput: () => string } {
  const input = new PassThrough();
  const output = new PassThrough();
  let outputData = '';
  output.on('data', (chunk: Buffer) => { outputData += chunk.toString(); });
  return { input, output, getOutput: () => outputData };
}

describe('singleSelect', () => {
  const options: SelectOption<string>[] = [
    { label: 'Alpha', value: 'a' },
    { label: 'Beta', value: 'b' },
    { label: 'Gamma', value: 'c' },
  ];

  it('selects first item on enter', async () => {
    const io = createMockIO();
    const promise = singleSelect('Pick one:', options, io);
    io.input.write('\r');
    expect(await promise).toBe('a');
  });

  it('selects first item on space', async () => {
    const io = createMockIO();
    const promise = singleSelect('Pick one:', options, io);
    io.input.write(' ');
    expect(await promise).toBe('a');
  });

  it('navigates down and selects', async () => {
    const io = createMockIO();
    const promise = singleSelect('Pick one:', options, io);
    io.input.write('\x1b[B\r'); // arrow down + enter
    expect(await promise).toBe('b');
  });

  it('wraps around from bottom to top', async () => {
    const io = createMockIO();
    const promise = singleSelect('Pick one:', options, io);
    io.input.write('\x1b[B\x1b[B\x1b[B\r'); // 3x down wraps to first
    expect(await promise).toBe('a');
  });
});

describe('confirm', () => {
  it('returns yes when enter pressed (first option)', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('\r');
    expect(await promise).toBe('yes');
  });

  it('returns no when arrow down + enter', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('\x1b[B\r'); // down to No
    expect(await promise).toBe('no');
  });

  it('returns edit when allowEdit and arrow to Edit', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', { allowEdit: true }, io);
    io.input.write('\x1b[B\x1b[B\r'); // down 2x to Edit
    expect(await promise).toBe('edit');
  });

  it('has no edit option when allowEdit is false', async () => {
    const io = createMockIO();
    const promise = confirm('Continue?', {}, io);
    io.input.write('\x1b[B\x1b[B\r'); // down 2x wraps to Yes (only 2 options)
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

describe('editField', () => {
  it('returns user input when provided', async () => {
    const io = createMockIO();
    const promise = editField('cmd', 'npm run dev', io);
    io.input.write('yarn dev\n');
    expect(await promise).toBe('yarn dev');
  });

  it('returns current value on empty input', async () => {
    const io = createMockIO();
    const promise = editField('cmd', 'npm run dev', io);
    io.input.write('\n');
    expect(await promise).toBe('npm run dev');
  });

  it('returns undefined when no current and empty input', async () => {
    const io = createMockIO();
    const promise = editField('port_env', undefined, io);
    io.input.write('\n');
    expect(await promise).toBeUndefined();
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

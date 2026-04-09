import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { dim, green, blue, bold } from './format/colors.js';

export interface PromptIO {
  input: Readable;
  output: Writable;
}

export interface SelectOption<T = string> {
  label: string;
  value: T;
}

const defaultIO = (): PromptIO => ({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Raw-mode key handler shared by singleSelect and multiSelect.
 * Calls onKey(ch) for each non-escape character, and onArrow('up'|'down') for arrows.
 */
function rawKeyLoop(
  input: Readable,
  onArrow: (dir: 'up' | 'down') => void,
  onKey: (ch: string) => boolean, // return true to stop listening
): void {
  const isRawCapable = 'setRawMode' in input && typeof (input as NodeJS.ReadStream).setRawMode === 'function';
  if (isRawCapable) {
    (input as NodeJS.ReadStream).setRawMode(true);
  }
  input.resume();

  let escBuffer = '';

  const handleData = (data: Buffer) => {
    const str = data.toString();
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (escBuffer.length > 0) {
        escBuffer += ch;
        const finalChar = escBuffer[escBuffer.length - 1];
        if (escBuffer.length >= 3 && escBuffer[1] === '[' && /[A-Za-z]/.test(finalChar)) {
          if (finalChar === 'A') onArrow('up');
          else if (finalChar === 'B') onArrow('down');
          escBuffer = '';
        }
        continue;
      }

      if (ch === '\x1b') {
        escBuffer = ch;
        continue;
      }

      const stop = onKey(ch);
      if (stop) {
        input.removeListener('data', handleData);
        if (isRawCapable) {
          (input as NodeJS.ReadStream).setRawMode(false);
        }
        return;
      }
    }
  };

  input.on('data', handleData);
}

/**
 * Reusable ANSI re-render: clears `lineCount` lines and moves cursor back up.
 */
function clearLines(output: Writable, lineCount: number) {
  output.write(`\x1b[${lineCount}A`);
  for (let i = 0; i < lineCount; i++) {
    output.write('\x1b[2K');
    if (i < lineCount - 1) output.write('\n');
  }
  output.write(`\x1b[${lineCount - 1}A`);
}

/**
 * Single-select prompt — user picks one option with arrow keys + space/enter.
 * Used for Yes / No / Edit confirmations.
 */
export async function singleSelect<T>(
  message: string,
  options: SelectOption<T>[],
  io?: PromptIO,
): Promise<T> {
  const { input, output } = io ?? defaultIO();
  let cursor = 0;
  let hasRendered = false;

  function render() {
    const totalLines = 1 + options.length; // message + options
    if (hasRendered) clearLines(output, totalLines);

    const items = options.map((opt, i) => {
      const radio = i === cursor ? green('\u25cf') : dim('\u25cb');
      const label = i === cursor ? bold(opt.label) : opt.label;
      return `    ${radio} ${label}`;
    });
    output.write(`  ${message}\n${items.join('\n')}\n`);
    hasRendered = true;
  }

  render();

  return new Promise<T>((resolve) => {
    rawKeyLoop(
      input,
      (dir) => {
        if (dir === 'up') cursor = cursor > 0 ? cursor - 1 : options.length - 1;
        else cursor = cursor < options.length - 1 ? cursor + 1 : 0;
        render();
      },
      (ch) => {
        if (ch === ' ' || ch === '\r' || ch === '\n') {
          resolve(options[cursor].value);
          return true;
        }
        return false;
      },
    );
  });
}

/**
 * Ask a yes/no (optionally edit) confirmation via single-select.
 */
export async function confirm(
  message: string,
  options: { allowEdit?: boolean } = {},
  io?: PromptIO,
): Promise<'yes' | 'no' | 'edit'> {
  const choices: SelectOption<'yes' | 'no' | 'edit'>[] = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];
  if (options.allowEdit) {
    choices.push({ label: 'Edit', value: 'edit' });
  }
  return singleSelect(message, choices, io);
}

/**
 * Prompt user to edit a list of items (comma-separated).
 * Empty input keeps the current list unchanged.
 */
export async function editList(
  current: string[],
  io?: PromptIO,
): Promise<string[]> {
  const { input, output } = io ?? defaultIO();

  const rl = createInterface({ input, output, terminal: false });

  return new Promise<string[]>((resolve) => {
    if (current.length > 0) {
      output.write(`  ${dim('Current:')} ${current.join(', ')}\n`);
    }
    output.write(`  ${dim('Enter commands (comma-separated), or press enter to keep current:')} `);

    rl.once('line', (line) => {
      rl.close();
      const trimmed = line.trim();

      if (trimmed === '') {
        resolve(current);
        return;
      }

      const items = trimmed
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      resolve(items);
    });
  });
}

/**
 * Prompt user to edit a single field value.
 * Empty input keeps the current value. Returns undefined if current is undefined and input is empty.
 */
export async function editField(
  label: string,
  current: string | undefined,
  io?: PromptIO,
): Promise<string | undefined> {
  const { input, output } = io ?? defaultIO();

  const rl = createInterface({ input, output, terminal: false });

  return new Promise<string | undefined>((resolve) => {
    const hint = current ? dim(` (${current})`) : '';
    output.write(`  ${label}${hint}: `);

    rl.once('line', (line) => {
      rl.close();
      const trimmed = line.trim();
      resolve(trimmed || current);
    });
  });
}

/**
 * Interactive multi-select with checkboxes.
 * Uses raw mode on real terminals; processes escape sequences on PassThrough streams.
 */
export async function multiSelect<T>(
  options: SelectOption<T>[],
  io?: PromptIO,
): Promise<T[]> {
  if (options.length === 0) return [];

  const { input, output } = io ?? defaultIO();

  const selected = new Set<number>();
  let cursor = 0;
  let hasRendered = false;

  function render() {
    const totalLines = options.length + 1; // options + hint line
    if (hasRendered) clearLines(output, totalLines);

    const lines = options.map((opt, i) => {
      const check = selected.has(i) ? green('\u2713') : ' ';
      const marker = `[${check}]`;
      const pointer = i === cursor ? blue('>') : ' ';
      const label = i === cursor ? bold(opt.label) : opt.label;
      return `${pointer} ${marker} ${label}`;
    });
    lines.push(dim('  space = toggle, enter = confirm'));
    output.write(lines.join('\n') + '\n');
    hasRendered = true;
  }

  render();

  return new Promise<T[]>((resolve) => {
    rawKeyLoop(
      input,
      (dir) => {
        if (dir === 'up') cursor = cursor > 0 ? cursor - 1 : options.length - 1;
        else cursor = cursor < options.length - 1 ? cursor + 1 : 0;
        render();
      },
      (ch) => {
        if (ch === ' ') {
          if (selected.has(cursor)) selected.delete(cursor);
          else selected.add(cursor);
          render();
          return false;
        }
        if (ch === '\r' || ch === '\n') {
          resolve(options.filter((_, idx) => selected.has(idx)).map((opt) => opt.value));
          return true;
        }
        return false;
      },
    );
  });
}

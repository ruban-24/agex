import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

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
 * Ask a yes/no (optionally edit) confirmation question.
 * - y or empty → 'yes'
 * - n → 'no'
 * - e/edit (when allowEdit) → 'edit'
 * - e/edit (when !allowEdit) → 'yes'
 */
export async function confirm(
  message: string,
  options: { allowEdit?: boolean } = {},
  io?: PromptIO,
): Promise<'yes' | 'no' | 'edit'> {
  const { input, output } = io ?? defaultIO();
  const suffix = options.allowEdit ? '(y/n/edit)' : '(y/n)';

  const rl = createInterface({ input, output, terminal: false });

  return new Promise<'yes' | 'no' | 'edit'>((resolve) => {
    output.write(`${message} ${suffix} `);

    rl.once('line', (line) => {
      rl.close();
      const answer = line.trim().toLowerCase();

      if (answer === 'n' || answer === 'no') {
        resolve('no');
        return;
      }

      if (options.allowEdit && (answer === 'e' || answer === 'edit')) {
        resolve('edit');
        return;
      }

      // y, empty, or anything else (including 'e' when !allowEdit)
      resolve('yes');
    });
  });
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
      output.write(`Current: ${current.join(', ')}\n`);
    }
    output.write('Enter commands (comma-separated), or press enter to keep current: ');

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
    if (hasRendered) {
      // Move cursor up and clear each line to overwrite previous render
      output.write(`\x1b[${options.length}A`);
      for (let i = 0; i < options.length; i++) {
        output.write('\x1b[2K');
        if (i < options.length - 1) output.write('\n');
      }
      output.write(`\x1b[${options.length - 1}A`);
    }
    const lines = options.map((opt, i) => {
      const marker = selected.has(i) ? '[x]' : '[ ]';
      const pointer = i === cursor ? '>' : ' ';
      return `${pointer} ${marker} ${opt.label}`;
    });
    output.write(lines.join('\n') + '\n');
    hasRendered = true;
  }

  render();

  return new Promise<T[]>((resolve) => {
    const isRawCapable = 'setRawMode' in input && typeof (input as NodeJS.ReadStream).setRawMode === 'function';

    if (isRawCapable) {
      (input as NodeJS.ReadStream).setRawMode(true);
    }

    // Resume in case a prior readline.close() paused the stream
    input.resume();

    let escBuffer = '';

    const handleData = (data: Buffer) => {
      const str = data.toString();

      for (let i = 0; i < str.length; i++) {
        const ch = str[i];

        if (escBuffer.length > 0) {
          escBuffer += ch;
          // CSI sequences terminate with a letter
          const finalChar = escBuffer[escBuffer.length - 1];
          if (escBuffer.length >= 3 && escBuffer[1] === '[' && /[A-Za-z]/.test(finalChar)) {
            if (finalChar === 'A') {
              cursor = cursor > 0 ? cursor - 1 : options.length - 1;
              render();
            } else if (finalChar === 'B') {
              cursor = cursor < options.length - 1 ? cursor + 1 : 0;
              render();
            }
            // Unrecognized sequences are silently ignored
            escBuffer = '';
          }
          continue;
        }

        if (ch === '\x1b') {
          escBuffer = ch;
          continue;
        }

        if (ch === ' ') {
          if (selected.has(cursor)) {
            selected.delete(cursor);
          } else {
            selected.add(cursor);
          }
          render();
          continue;
        }

        if (ch === '\r' || ch === '\n') {
          input.removeListener('data', handleData);
          if (isRawCapable) {
            (input as NodeJS.ReadStream).setRawMode(false);
          }
          resolve(options.filter((_, idx) => selected.has(idx)).map((opt) => opt.value));
          return;
        }
      }
    };

    input.on('data', handleData);
  });
}

import { describe, it, expect } from 'vitest';
import { green, dim, bold, stripAnsi, isTTY } from '../../../src/cli/format/colors.js';

describe('color functions', () => {
  it('wraps text in ANSI escape codes', () => {
    expect(green('hello')).toBe('\x1b[32mhello\x1b[0m');
  });

  it('supports dim and bold modifiers', () => {
    expect(dim('x')).toBe('\x1b[2mx\x1b[0m');
    expect(bold('x')).toBe('\x1b[1mx\x1b[0m');
  });
});

describe('stripAnsi', () => {
  it('removes ANSI codes and returns plain text unchanged', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
    expect(stripAnsi('plain')).toBe('plain');
  });
});

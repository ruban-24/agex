import { describe, it, expect } from 'vitest';
import { statusSymbol, statusColor, fileStatusIndicator, checkSymbol, diffStats } from '../../../src/cli/format/symbols.js';
import { stripAnsi } from '../../../src/cli/format/colors.js';

describe('statusSymbol', () => {
  it('returns a non-empty symbol for each status', () => {
    const statuses = ['running', 'completed', 'failed', 'errored', 'merged', 'discarded', 'ready', 'pending', 'verifying', 'provisioning'] as const;
    for (const s of statuses) {
      expect(stripAnsi(statusSymbol(s)).length).toBeGreaterThan(0);
    }
  });
});

describe('statusColor', () => {
  it('wraps text in ANSI codes and preserves content', () => {
    const result = statusColor('completed', 'done');
    expect(result).toContain('\x1b[');
    expect(stripAnsi(result)).toBe('done');
  });
});

describe('checkSymbol', () => {
  it('returns distinct symbols for true and false', () => {
    expect(stripAnsi(checkSymbol(true))).toBe('✓');
    expect(stripAnsi(checkSymbol(false))).toBe('✗');
  });
});

describe('diffStats', () => {
  it('formats insertions and deletions with color', () => {
    const result = diffStats(42, 8);
    expect(stripAnsi(result)).toBe('+42 -8');
    expect(result).toContain('\x1b[32m');
    expect(result).toContain('\x1b[31m');
  });
});

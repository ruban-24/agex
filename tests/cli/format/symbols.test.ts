import { describe, it, expect } from 'vitest';
import { statusSymbol, statusColor, fileStatusIndicator, checkSymbol, diffStats } from '../../../src/cli/format/symbols.js';
import { stripAnsi } from '../../../src/cli/format/colors.js';

describe('statusSymbol', () => {
  it('returns ▶ for running', () => {
    expect(stripAnsi(statusSymbol('running'))).toBe('▶');
  });

  it('returns ✓ for completed', () => {
    expect(stripAnsi(statusSymbol('completed'))).toBe('✓');
  });

  it('returns ✗ for failed', () => {
    expect(stripAnsi(statusSymbol('failed'))).toBe('✗');
  });

  it('returns ✗ for errored', () => {
    expect(stripAnsi(statusSymbol('errored'))).toBe('✗');
  });

  it('returns ◆ for merged', () => {
    expect(stripAnsi(statusSymbol('merged'))).toBe('◆');
  });

  it('returns ○ for discarded', () => {
    expect(stripAnsi(statusSymbol('discarded'))).toBe('○');
  });

  it('returns ● for ready', () => {
    expect(stripAnsi(statusSymbol('ready'))).toBe('●');
  });

  it('returns ○ for pending', () => {
    expect(stripAnsi(statusSymbol('pending'))).toBe('○');
  });

  it('returns ▶ for verifying', () => {
    expect(stripAnsi(statusSymbol('verifying'))).toBe('▶');
  });

  it('returns ▶ for provisioning', () => {
    expect(stripAnsi(statusSymbol('provisioning'))).toBe('▶');
  });
});

describe('statusColor', () => {
  it('applies green to completed status text', () => {
    const result = statusColor('completed', 'completed');
    expect(result).toContain('\x1b[32m');
    expect(stripAnsi(result)).toBe('completed');
  });

  it('applies red to failed status text', () => {
    const result = statusColor('failed', 'failed');
    expect(result).toContain('\x1b[31m');
  });

  it('applies yellow to running status text', () => {
    const result = statusColor('running', 'running');
    expect(result).toContain('\x1b[33m');
  });
});

describe('checkSymbol', () => {
  it('returns green ✓ for true', () => {
    const result = checkSymbol(true);
    expect(stripAnsi(result)).toBe('✓');
    expect(result).toContain('\x1b[32m');
  });

  it('returns red ✗ for false', () => {
    const result = checkSymbol(false);
    expect(stripAnsi(result)).toBe('✗');
    expect(result).toContain('\x1b[31m');
  });
});

describe('diffStats', () => {
  it('formats insertions in green and deletions in red', () => {
    const result = diffStats(42, 8);
    expect(stripAnsi(result)).toBe('+42 -8');
    expect(result).toContain('\x1b[32m');
    expect(result).toContain('\x1b[31m');
  });

  it('handles zero values', () => {
    const result = diffStats(0, 0);
    expect(stripAnsi(result)).toBe('+0 -0');
  });
});

describe('fileStatusIndicator', () => {
  it('returns green A for added', () => {
    const result = fileStatusIndicator('A');
    expect(stripAnsi(result)).toBe('A');
    expect(result).toContain('\x1b[32m');
  });

  it('returns yellow M for modified', () => {
    const result = fileStatusIndicator('M');
    expect(stripAnsi(result)).toBe('M');
    expect(result).toContain('\x1b[33m');
  });

  it('returns red D for deleted', () => {
    const result = fileStatusIndicator('D');
    expect(stripAnsi(result)).toBe('D');
    expect(result).toContain('\x1b[31m');
  });
});

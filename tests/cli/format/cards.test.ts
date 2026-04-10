import { describe, it, expect } from 'vitest';
import { card, cardColorForStatus, sectionHeader, summaryLine, nextAction } from '../../../src/cli/format/cards.js';
import { stripAnsi } from '../../../src/cli/format/colors.js';

describe('card', () => {
  it('renders lines with a colored left border', () => {
    const result = card('green', ['line one', 'line two']);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(stripAnsi(line).trimStart().startsWith('┃')).toBe(true);
    }
  });
});

describe('sectionHeader', () => {
  it('renders an uppercase dim label', () => {
    const result = sectionHeader('Details');
    expect(stripAnsi(result)).toBe('DETAILS');
    expect(result).toContain('\x1b[2m');
  });
});

describe('summaryLine', () => {
  it('renders non-zero status counts and omits zero counts', () => {
    const counts = { completed: 2, running: 1, failed: 1, merged: 0, ready: 0, errored: 0, discarded: 0, pending: 0 };
    const plain = stripAnsi(summaryLine(4, counts));
    expect(plain).toContain('4 tasks');
    expect(plain).toContain('2 completed');
    expect(plain).toContain('1 running');
    expect(plain).not.toContain('merged');
  });
});

describe('nextAction', () => {
  it('renders a next action hint', () => {
    const plain = stripAnsi(nextAction('agex accept abc123'));
    expect(plain).toContain('→');
    expect(plain).toContain('agex accept abc123');
  });
});

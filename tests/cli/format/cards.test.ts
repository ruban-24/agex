import { describe, it, expect } from 'vitest';
import { card, sectionHeader, summaryLine, nextAction } from '../../../src/cli/format/cards.js';
import { stripAnsi } from '../../../src/cli/format/colors.js';

describe('card', () => {
  it('renders lines with a colored left border', () => {
    const result = card('green', ['line one', 'line two']);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    // Each line should start with ┃ (after stripping color)
    for (const line of lines) {
      expect(stripAnsi(line).trimStart().startsWith('┃')).toBe(true);
    }
  });

  it('supports different border colors', () => {
    const greenCard = card('green', ['hello']);
    const redCard = card('red', ['hello']);
    expect(greenCard).not.toBe(redCard);
    expect(stripAnsi(greenCard)).toBe(stripAnsi(redCard));
  });
});

describe('sectionHeader', () => {
  it('renders an uppercase dim label', () => {
    const result = sectionHeader('Details');
    expect(stripAnsi(result)).toBe('DETAILS');
    expect(result).toContain('\x1b[2m'); // dim
  });
});

describe('summaryLine', () => {
  it('renders status counts with colors', () => {
    const counts = { completed: 2, running: 1, failed: 1, merged: 0, ready: 0, errored: 0, discarded: 0, pending: 0 };
    const result = summaryLine(4, counts);
    const plain = stripAnsi(result);
    expect(plain).toContain('4 tasks');
    expect(plain).toContain('2 completed');
    expect(plain).toContain('1 running');
    expect(plain).toContain('1 failed');
    // merged=0 should not appear
    expect(plain).not.toContain('merged');
  });

  it('omits zero counts', () => {
    const counts = { completed: 3, running: 0, failed: 0, merged: 0, ready: 0, errored: 0, discarded: 0, pending: 0 };
    const result = summaryLine(3, counts);
    const plain = stripAnsi(result);
    expect(plain).toContain('3 completed');
    expect(plain).not.toContain('running');
    expect(plain).not.toContain('failed');
  });
});

describe('nextAction', () => {
  it('renders a next action hint', () => {
    const result = nextAction('agentpod merge abc123');
    const plain = stripAnsi(result);
    expect(plain).toContain('→');
    expect(plain).toContain('agentpod merge abc123');
  });
});

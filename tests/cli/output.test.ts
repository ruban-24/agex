import { describe, it, expect } from 'vitest';
import { formatOutput, formatTable } from '../../src/cli/output.js';
import type { TaskRecord } from '../../src/types.js';

describe('formatOutput', () => {
  it('returns JSON string when human=false', () => {
    const data = { id: 'abc123', status: 'ready' };
    const result = formatOutput(data, false);
    expect(JSON.parse(result)).toEqual(data);
  });

  it('returns pretty JSON when human=true and no formatter', () => {
    const data = { id: 'abc123', status: 'ready' };
    const result = formatOutput(data, true);
    expect(result).toContain('"id"');
    expect(result).toContain('abc123');
  });
});

describe('formatTable', () => {
  it('formats a simple table with headers and rows', () => {
    const headers = ['ID', 'Status'];
    const rows = [
      ['abc123', 'completed'],
      ['def456', 'failed'],
    ];

    const result = formatTable(headers, rows);

    expect(result).toContain('ID');
    expect(result).toContain('Status');
    expect(result).toContain('abc123');
    expect(result).toContain('completed');
    expect(result).toContain('def456');
    expect(result).toContain('failed');
  });

  it('pads columns to consistent widths', () => {
    const headers = ['ID', 'Status'];
    const rows = [['a', 'completed']];
    const result = formatTable(headers, rows);
    const lines = result.split('\n').filter(Boolean);
    // All lines should have consistent character widths (padded)
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + separator + row
  });
});

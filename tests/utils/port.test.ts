import { describe, it, expect } from 'vitest';
import { calculatePort } from '../../src/utils/port.js';

describe('calculatePort', () => {
  it('returns base + step for task index 0', () => {
    expect(calculatePort(0, 3000, 100)).toBe(3100);
  });

  it('increments by step for each task index', () => {
    expect(calculatePort(1, 3000, 100)).toBe(3200);
    expect(calculatePort(2, 3000, 100)).toBe(3300);
  });

  it('uses custom base and step', () => {
    expect(calculatePort(0, 8000, 50)).toBe(8050);
    expect(calculatePort(3, 8000, 50)).toBe(8200);
  });
});

import { describe, it, expect } from 'vitest';
import { calculatePort, nextAvailablePort } from '../../src/utils/port.js';

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

describe('nextAvailablePort', () => {
  it('returns first port when no existing ports', () => {
    expect(nextAvailablePort([], 3000, 100)).toBe(3100);
  });

  it('returns next sequential port after existing [3100]', () => {
    expect(nextAvailablePort([3100], 3000, 100)).toBe(3200);
  });

  it('fills gaps when tasks have been deleted [3200]', () => {
    expect(nextAvailablePort([3200], 3000, 100)).toBe(3100);
  });

  it('fills earliest gap [3100, 3300]', () => {
    expect(nextAvailablePort([3100, 3300], 3000, 100)).toBe(3200);
  });

  it('returns next after max when no gaps [3100, 3200, 3300]', () => {
    expect(nextAvailablePort([3100, 3200, 3300], 3000, 100)).toBe(3400);
  });

  it('handles unordered input [3300, 3100]', () => {
    expect(nextAvailablePort([3300, 3100], 3000, 100)).toBe(3200);
  });
});

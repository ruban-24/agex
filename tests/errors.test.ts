import { describe, it, expect } from 'vitest';
import { AgexError } from '../src/errors.js';
import { EXIT_CODES } from '../src/constants.js';

describe('AgexError', () => {
  it('extends Error with suggestion and exitCode', () => {
    const err = new AgexError('Task not found: abc123', {
      suggestion: "Run 'agex list' to see available tasks",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgexError);
    expect(err.message).toBe('Task not found: abc123');
    expect(err.suggestion).toBe("Run 'agex list' to see available tasks");
    expect(err.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
  });

  it('accepts custom exitCode', () => {
    const err = new AgexError('Not a git repo', {
      suggestion: 'agex must be run inside a git repository',
      exitCode: EXIT_CODES.WORKSPACE_ERROR,
    });
    expect(err.exitCode).toBe(EXIT_CODES.WORKSPACE_ERROR);
  });
});

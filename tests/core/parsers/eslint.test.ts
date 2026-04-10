import { describe, it, expect } from 'vitest';
import { parseEslint } from '../../../src/core/parsers/eslint.js';

const ESLINT_OUTPUT = `/Users/ruban/project/src/auth.ts
  42:5   error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  57:10  warning  'unused' is defined but never used        @typescript-eslint/no-unused-vars

/Users/ruban/project/src/utils.ts
  3:1  error  Missing return type on function  @typescript-eslint/explicit-function-return-type`;

describe('parseEslint', () => {
  it('extracts errors with file, line, message, and rule', () => {
    const errors = parseEslint(ESLINT_OUTPUT);
    expect(errors).toHaveLength(3);
    expect(errors[0].file).toContain('src/auth.ts');
    expect(errors[0].line).toBe(42);
    expect(errors[0].message).toContain('Unexpected any');
    expect(errors[0].rule).toBe('@typescript-eslint/no-explicit-any');
  });

  it('parses errors from multiple files', () => {
    const errors = parseEslint(ESLINT_OUTPUT);
    expect(errors[2].file).toContain('src/utils.ts');
    expect(errors[2].line).toBe(3);
  });

  it('returns empty array for clean output', () => {
    expect(parseEslint('')).toEqual([]);
  });
});

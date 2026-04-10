import { describe, it, expect } from 'vitest';
import { parseTypescript } from '../../../src/core/parsers/typescript.js';

const TSC_OUTPUT = `src/auth.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/types.ts(10,1): error TS2307: Cannot find module './missing' or its corresponding type declarations.
src/utils.ts(3,14): error TS7006: Parameter 'x' implicitly has an 'any' type.`;

describe('parseTypescript', () => {
  it('extracts file, line, rule, and message', () => {
    const errors = parseTypescript(TSC_OUTPUT);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({
      file: 'src/auth.ts',
      line: 42,
      message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
      rule: 'TS2345',
    });
  });

  it('extracts all errors', () => {
    const errors = parseTypescript(TSC_OUTPUT);
    expect(errors[1].file).toBe('src/types.ts');
    expect(errors[1].rule).toBe('TS2307');
    expect(errors[2].file).toBe('src/utils.ts');
    expect(errors[2].line).toBe(3);
  });

  it('returns empty array for clean output', () => {
    expect(parseTypescript('')).toEqual([]);
  });
});

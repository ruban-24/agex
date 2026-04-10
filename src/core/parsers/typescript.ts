import type { ParsedError } from '../../types.js';

export function parseTypescript(raw: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const pattern = /^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)$/gm;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      message: match[4],
      rule: match[3],
    });
  }
  return errors;
}

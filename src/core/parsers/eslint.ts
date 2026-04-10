import type { ParsedError } from '../../types.js';

export function parseEslint(raw: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = raw.split('\n');
  let currentFile: string | undefined;

  for (const line of lines) {
    // File path line: starts with / or drive letter, no leading whitespace
    if (line.match(/^\S/) && !line.match(/^\d+ problems?/)) {
      currentFile = line.trim();
      continue;
    }

    // Error line: "  42:5  error  message  rule"
    const errorMatch = line.match(/^\s+(\d+):\d+\s+(?:error|warning)\s+(.+?)\s{2,}(\S+)\s*$/);
    if (errorMatch && currentFile) {
      errors.push({
        file: currentFile,
        line: parseInt(errorMatch[1], 10),
        message: errorMatch[2].trim(),
        rule: errorMatch[3],
      });
    }
  }

  return errors;
}

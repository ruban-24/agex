import { EXIT_CODES } from './constants.js';

export class AgexError extends Error {
  suggestion: string;
  exitCode: number;

  constructor(message: string, opts: { suggestion: string; exitCode?: number }) {
    super(message);
    this.suggestion = opts.suggestion;
    this.exitCode = opts.exitCode ?? EXIT_CODES.INVALID_ARGS;
  }
}

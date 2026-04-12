import { execaCommand } from 'execa';
import type { VerificationResult, VerificationCheck, VerifyCommand, ParsedError } from '../types.js';
import { getParser } from './parsers/index.js';

export class Verifier {
  async runChecks(cwd: string, commands: VerifyCommand[]): Promise<VerificationResult> {
    // Explicit handling for empty commands — consistent across all call sites
    if (commands.length === 0) {
      return {
        passed: true,
        summary: 'No verify commands configured. Verification passed (0 checks).',
        checks: [],
      };
    }

    const checks: VerificationCheck[] = [];

    for (const entry of commands) {
      const cmd = typeof entry === 'string' ? entry : entry.cmd;
      const parserName = typeof entry === 'string' ? undefined : entry.parser;

      const start = Date.now();
      try {
        const result = await execaCommand(cmd, {
          cwd,
          shell: true,
          reject: false,
        });

        const duration_s = Math.round((Date.now() - start) / 1000);
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        const passed = result.exitCode === 0;

        let parsed: ParsedError[] | undefined;
        if (parserName) {
          const parser = getParser(parserName);
          if (parser && output) {
            const errors = parser(output);
            if (errors.length > 0) parsed = errors;
          }
        }

        checks.push({
          cmd,
          passed,
          exit_code: result.exitCode ?? 1,
          duration_s,
          output: output || undefined,
          parsed,
        });
      } catch (err: unknown) {
        const duration_s = Math.round((Date.now() - start) / 1000);
        checks.push({
          cmd,
          passed: false,
          exit_code: 1,
          duration_s,
          output: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const passed = checks.every((c) => c.passed);
    const total = checks.length;
    const failedCount = checks.filter((c) => !c.passed).length;
    const summary = passed
      ? `${total}/${total} checks passed`
      : `${failedCount} of ${total} checks failed`;

    return { passed, summary, checks };
  }
}

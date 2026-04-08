import { execaCommand } from 'execa';
import type { VerificationResult, VerificationCheck } from '../types.js';

export class Verifier {
  async runChecks(cwd: string, commands: string[]): Promise<VerificationResult> {
    const checks: VerificationCheck[] = [];

    for (const cmd of commands) {
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

        checks.push({
          cmd,
          passed,
          exit_code: result.exitCode ?? 1,
          duration_s,
          output: output || undefined,
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

    return {
      passed: checks.every((c) => c.passed),
      checks,
    };
  }
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Verifier } from '../../src/core/verifier.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';
import type { VerifyCommand } from '../../src/types.js';

describe('Verifier', () => {
  let repo: TestRepo;
  let verifier: Verifier;

  beforeEach(async () => {
    repo = await createTestRepo();
    verifier = new Verifier();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns passed=true when all commands succeed', async () => {
    const result = await verifier.runChecks(repo.path, ['true', 'echo ok']);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0].passed).toBe(true);
    expect(result.checks[0].exit_code).toBe(0);
    expect(result.checks[1].passed).toBe(true);
  });

  it('returns passed=false when any command fails', async () => {
    const result = await verifier.runChecks(repo.path, ['true', 'false']);

    expect(result.passed).toBe(false);
    expect(result.checks[0].passed).toBe(true);
    expect(result.checks[1].passed).toBe(false);
    expect(result.checks[1].exit_code).toBe(1);
  });

  it('records duration for each check', async () => {
    const result = await verifier.runChecks(repo.path, ['echo fast']);

    expect(result.checks[0].duration_s).toBeGreaterThanOrEqual(0);
    expect(typeof result.checks[0].duration_s).toBe('number');
  });

  it('captures command output', async () => {
    const result = await verifier.runChecks(repo.path, ['echo "test output"']);

    expect(result.checks[0].output).toContain('test output');
  });

  it('returns explicit message when commands array is empty', async () => {
    const result = await verifier.runChecks(repo.path, []);

    expect(result.passed).toBe(true);
    expect(result.summary).toBe('No verify commands configured. Verification passed (0 checks).');
    expect(result.checks).toEqual([]);
  });

  it('stores the command string in each check', async () => {
    const result = await verifier.runChecks(repo.path, ['echo hello']);

    expect(result.checks[0].cmd).toBe('echo hello');
  });

  it('includes summary in result', async () => {
    const result = await verifier.runChecks(repo.path, ['echo pass', 'echo pass']);

    expect(result.summary).toBe('2/2 checks passed');
  });

  it('includes failure summary when checks fail', async () => {
    const result = await verifier.runChecks(repo.path, ['echo pass', 'exit 1']);

    expect(result.summary).toBe('1 of 2 checks failed');
    expect(result.passed).toBe(false);
  });
});

describe('Verifier with VerifyCommand objects', () => {
  let repo: TestRepo;
  let verifier: Verifier;

  beforeEach(async () => {
    repo = await createTestRepo();
    verifier = new Verifier();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('accepts VerifyCommand[] with string and object entries', async () => {
    const commands: VerifyCommand[] = [
      'echo ok',
      { cmd: 'echo "src/a.ts(1,1): error TS123: bad"', parser: 'typescript' },
    ];
    const result = await verifier.runChecks(repo.path, commands);

    expect(result.checks).toHaveLength(2);
    expect(result.checks[0].cmd).toBe('echo ok');
    expect(result.checks[1].cmd).toBe('echo "src/a.ts(1,1): error TS123: bad"');
  });

  it('populates parsed errors when parser is specified', async () => {
    const commands: VerifyCommand[] = [
      { cmd: 'echo "src/a.ts(1,1): error TS2345: bad type"', parser: 'typescript' },
    ];
    const result = await verifier.runChecks(repo.path, commands);

    expect(result.checks[0].parsed).toBeDefined();
    expect(result.checks[0].parsed!.length).toBeGreaterThanOrEqual(1);
    expect(result.checks[0].parsed![0].rule).toBe('TS2345');
  });

  it('leaves parsed undefined when no parser specified', async () => {
    const commands: VerifyCommand[] = ['echo ok'];
    const result = await verifier.runChecks(repo.path, commands);

    expect(result.checks[0].parsed).toBeUndefined();
  });

  it('gracefully handles unknown parser name', async () => {
    const commands: VerifyCommand[] = [
      { cmd: 'echo hello', parser: 'nonexistent' },
    ];
    const result = await verifier.runChecks(repo.path, commands);

    expect(result.checks[0].parsed).toBeUndefined();
    expect(result.checks[0].output).toContain('hello');
  });
});

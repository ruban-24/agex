import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Verifier } from '../../src/core/verifier.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

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

  it('returns empty checks for empty command list', async () => {
    const result = await verifier.runChecks(repo.path, []);

    expect(result.passed).toBe(true);
    expect(result.checks).toEqual([]);
  });

  it('stores the command string in each check', async () => {
    const result = await verifier.runChecks(repo.path, ['echo hello']);

    expect(result.checks[0].cmd).toBe('echo hello');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/loader.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('loadConfig', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns empty config when config.yml does not exist', async () => {
    const config = await loadConfig(repo.path);
    expect(config).toEqual({});
  });

  it('parses verify commands from config.yml', async () => {
    const agentpodDir = join(repo.path, '.agentpod');
    await mkdir(agentpodDir, { recursive: true });
    await writeFile(
      join(agentpodDir, 'config.yml'),
      'verify:\n  - npm test\n  - npm run lint\n'
    );

    const config = await loadConfig(repo.path);
    expect(config.verify).toEqual(['npm test', 'npm run lint']);
  });

  it('parses copy and symlink arrays', async () => {
    const agentpodDir = join(repo.path, '.agentpod');
    await mkdir(agentpodDir, { recursive: true });
    await writeFile(
      join(agentpodDir, 'config.yml'),
      'copy:\n  - .env\n  - .env.local\nsymlink:\n  - node_modules\n'
    );

    const config = await loadConfig(repo.path);
    expect(config.copy).toEqual(['.env', '.env.local']);
    expect(config.symlink).toEqual(['node_modules']);
  });

  it('parses ports configuration', async () => {
    const agentpodDir = join(repo.path, '.agentpod');
    await mkdir(agentpodDir, { recursive: true });
    await writeFile(
      join(agentpodDir, 'config.yml'),
      'ports:\n  base: 8000\n  offset: 50\n'
    );

    const config = await loadConfig(repo.path);
    expect(config.ports).toEqual({ base: 8000, offset: 50 });
  });

  it('parses setup hooks', async () => {
    const agentpodDir = join(repo.path, '.agentpod');
    await mkdir(agentpodDir, { recursive: true });
    await writeFile(
      join(agentpodDir, 'config.yml'),
      'setup:\n  - npm install\nsetup_background:\n  - npm run dev\n'
    );

    const config = await loadConfig(repo.path);
    expect(config.setup).toEqual(['npm install']);
    expect(config.setup_background).toEqual(['npm run dev']);
  });
});

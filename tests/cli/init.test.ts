import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { initCommand, dumpConfigWithComments } from '../../src/cli/commands/init.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('initCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('creates .agentpod directory with tasks and worktrees subdirs', async () => {
    await initCommand(repo.path, {});

    await access(join(repo.path, '.agentpod'));
    await access(join(repo.path, '.agentpod', 'tasks'));
    await access(join(repo.path, '.agentpod', 'worktrees'));
  });

  it('adds .agentpod/ to .gitignore', async () => {
    await initCommand(repo.path, {});

    const gitignore = await readFile(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.agentpod/');
  });

  it('creates .gitignore if it does not exist', async () => {
    // Remove existing .gitignore if any
    try {
      await rm(join(repo.path, '.gitignore'));
    } catch {
      // Fine
    }

    await initCommand(repo.path, {});

    const gitignore = await readFile(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.agentpod/');
  });

  it('does not duplicate .agentpod/ in .gitignore on re-init', async () => {
    await initCommand(repo.path, {});
    await initCommand(repo.path, {});

    const gitignore = await readFile(join(repo.path, '.gitignore'), 'utf-8');
    const matches = gitignore.match(/\.agentpod\//g);
    expect(matches).toHaveLength(1);
  });

  it('creates config.yml with verify commands when --verify provided', async () => {
    await initCommand(repo.path, { verify: ['npm test', 'npm run lint'] });

    const config = await readFile(join(repo.path, '.agentpod', 'config.yml'), 'utf-8');
    expect(config).toContain('npm test');
    expect(config).toContain('npm run lint');
  });

  it('writes config.yml with provisioning fields and comments', async () => {
    await initCommand(repo.path, {
      verify: ['npm test'],
      copy: ['.env'],
      symlink: ['node_modules'],
      setup: ['npm install'],
    });

    const config = await readFile(join(repo.path, '.agentpod', 'config.yml'), 'utf-8');
    expect(config).toContain('npm test');
    expect(config).toContain('.env');
    expect(config).toContain('node_modules');
    expect(config).toContain('npm install');
    expect(config).toContain('# Commands to verify task results');
    expect(config).toContain('# Files to copy into each worktree');
    expect(config).toContain('# Directories to symlink into worktrees');
    expect(config).toContain('# Commands to run after workspace creation');
  });

  it('writes skill files for selected agents', async () => {
    await initCommand(repo.path, { agents: ['claude-code'] });
    const content = await readFile(join(repo.path, '.claude', 'skills', 'agentpod', 'SKILL.md'), 'utf-8');
    expect(content).toContain('name: agentpod');
  });

  it('writes skill files for multiple agents', async () => {
    await initCommand(repo.path, { agents: ['claude-code', 'codex'] });
    await access(join(repo.path, '.claude', 'skills', 'agentpod', 'SKILL.md'));
    await access(join(repo.path, '.agents', 'skills', 'agentpod', 'SKILL.md'));
  });

  it('returns list of created files', async () => {
    const result = await initCommand(repo.path, {
      verify: ['npm test'],
      agents: ['claude-code'],
    });
    expect(result.files).toContain('.agentpod/config.yml');
    expect(result.files).toContain('.claude/skills/agentpod/SKILL.md');
  });

  it('returns verify and agents in result', async () => {
    const result = await initCommand(repo.path, {
      verify: ['npm test'],
      agents: ['claude-code'],
    });
    expect(result.verify).toEqual(['npm test']);
    expect(result.agents).toEqual(['claude-code']);
  });

  it('writes config.yml with run config', async () => {
    await initCommand(repo.path, {
      run: { cmd: 'npm run dev', port_env: 'PORT' },
    });

    const config = await readFile(join(repo.path, '.agentpod', 'config.yml'), 'utf-8');
    expect(config).toContain('npm run dev');
    expect(config).toContain('PORT');
  });

  it('returns run in result', async () => {
    const result = await initCommand(repo.path, {
      run: { cmd: 'npm run dev', port_env: 'PORT' },
    });
    expect(result.run).toEqual({ cmd: 'npm run dev', port_env: 'PORT' });
  });

  it('does not write config.yml when no verify or provisioning provided', async () => {
    await initCommand(repo.path, {});
    // config.yml should not exist
    await expect(access(join(repo.path, '.agentpod', 'config.yml'))).rejects.toThrow();
  });
});

describe('dumpConfigWithComments', () => {
  it('adds section comments before each key', () => {
    const yaml = dumpConfigWithComments({
      verify: ['npm test'],
      copy: ['.env'],
      symlink: ['node_modules'],
      setup: ['npm install'],
    });

    expect(yaml).toBe(
      '# Commands to verify task results\n' +
      'verify:\n' +
      '  - npm test\n' +
      '\n' +
      '# Files to copy into each worktree (e.g., secrets not in git)\n' +
      'copy:\n' +
      '  - .env\n' +
      '\n' +
      '# Directories to symlink into worktrees (shared, not copied)\n' +
      'symlink:\n' +
      '  - node_modules\n' +
      '\n' +
      '# Commands to run after workspace creation\n' +
      'setup:\n' +
      '  - npm install\n'
    );
  });

  it('omits sections with no values', () => {
    const yaml = dumpConfigWithComments({ verify: ['npm test'] });
    expect(yaml).toBe(
      '# Commands to verify task results\n' +
      'verify:\n' +
      '  - npm test\n'
    );
    expect(yaml).not.toContain('copy');
    expect(yaml).not.toContain('symlink');
  });

  it('includes run config with comment', () => {
    const yaml = dumpConfigWithComments({
      run: { cmd: 'npm run dev', port_env: 'PORT' },
    });
    expect(yaml).toContain('# Dev server started per-task so agents can test against it');
    expect(yaml).toContain('npm run dev');
    expect(yaml).toContain('PORT');
  });
});

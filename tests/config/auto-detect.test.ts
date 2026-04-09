import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { detectVerifyCommands, detectProvisioning, detectProjectType } from '../../src/config/auto-detect.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('detectVerifyCommands', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns empty array when no recognizable files exist', async () => {
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toEqual([]);
  });

  it.each([
    ['npm test', 'package.json', JSON.stringify({ scripts: { test: 'vitest run' } })],
    ['npm run lint', 'package.json', JSON.stringify({ scripts: { lint: 'eslint .' } })],
    ['npm run build', 'package.json', JSON.stringify({ scripts: { build: 'tsc' } })],
    ['pytest', 'pyproject.toml', '[tool.pytest]\n'],
    ['cargo test', 'Cargo.toml', '[package]\nname = "test"\n'],
    ['go test ./...', 'go.mod', 'module example.com/test\n'],
    ['make test', 'Makefile', 'test:\n\techo "testing"\n'],
  ])('detects %s from %s', async (expected, file, content) => {
    await writeFile(join(repo.path, file), content);
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain(expected);
  });

  it('detects all three npm scripts when present', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .', build: 'tsc' } })
    );

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toEqual(['npm test', 'npm run lint', 'npm run build']);
  });
});

describe('detectProvisioning', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns empty object when nothing detected', async () => {
    const config = await detectProvisioning(repo.path);
    expect(config).toEqual({});
  });

  it('detects .env for copy', async () => {
    await writeFile(join(repo.path, '.env'), 'SECRET=value\n');
    const config = await detectProvisioning(repo.path);
    expect(config.copy).toEqual(['.env']);
  });

  it('detects node_modules for symlink', async () => {
    await mkdir(join(repo.path, 'node_modules'), { recursive: true });
    const config = await detectProvisioning(repo.path);
    expect(config.symlink).toEqual(['node_modules']);
  });

  it.each([
    ['npm install', 'package.json', JSON.stringify({ dependencies: { lodash: '^4.0.0' } })],
    ['npm install', 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } })],
    ['pipenv install', 'Pipfile', '[packages]\n'],
    ['pip install -e .', 'pyproject.toml', '[project]\nname = "myapp"\n'],
    ['go mod download', 'go.mod', 'module example.com/test\n'],
  ])('detects setup command "%s" from %s', async (expected, file, content) => {
    await writeFile(join(repo.path, file), content);
    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual([expected]);
  });

  it('does not detect npm install from package.json without dependencies', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ name: 'bare-project' })
    );
    const config = await detectProvisioning(repo.path);
    expect(config.setup).toBeUndefined();
  });

  it('detects multiple aspects together', async () => {
    await writeFile(join(repo.path, '.env'), 'SECRET=value\n');
    await mkdir(join(repo.path, 'node_modules'), { recursive: true });
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.0.0' } })
    );

    const config = await detectProvisioning(repo.path);
    expect(config.copy).toEqual(['.env']);
    expect(config.symlink).toEqual(['node_modules']);
    expect(config.setup).toEqual(['npm install']);
  });
});

describe('detectProjectType', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns null when no recognizable files exist', async () => {
    const type = await detectProjectType(repo.path);
    expect(type).toBeNull();
  });

  it.each([
    ['Node.js (package.json)', 'package.json', JSON.stringify({ name: 'test' })],
    ['Python (pyproject.toml)', 'pyproject.toml', '[project]\n'],
    ['Python (Pipfile)', 'Pipfile', '[packages]\n'],
    ['Rust (Cargo.toml)', 'Cargo.toml', '[package]\nname = "test"\n'],
    ['Go (go.mod)', 'go.mod', 'module example.com/test\n'],
    ['Make (Makefile)', 'Makefile', 'all:\n\techo "build"\n'],
  ])('detects %s from %s', async (expected, file, content) => {
    await writeFile(join(repo.path, file), content);
    const type = await detectProjectType(repo.path);
    expect(type).toBe(expected);
  });

  it('returns first match by priority when multiple files exist', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(repo.path, 'Makefile'), 'all:\n\techo "build"\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Node.js (package.json)');
  });
});

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

  it('detects npm test from package.json with test script', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('npm test');
  });

  it('detects npm run lint from package.json with lint script', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { lint: 'eslint .' } })
    );

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('npm run lint');
  });

  it('detects npm run build from package.json with build script', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { build: 'tsc' } })
    );

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('npm run build');
  });

  it('detects all three npm scripts when present', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .', build: 'tsc' } })
    );

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toEqual(['npm test', 'npm run lint', 'npm run build']);
  });

  it('detects pytest from pyproject.toml', async () => {
    await writeFile(join(repo.path, 'pyproject.toml'), '[tool.pytest]\n');

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('pytest');
  });

  it('detects cargo test from Cargo.toml', async () => {
    await writeFile(join(repo.path, 'Cargo.toml'), '[package]\nname = "test"\n');

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('cargo test');
  });

  it('detects go test from go.mod', async () => {
    await writeFile(join(repo.path, 'go.mod'), 'module example.com/test\n');

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('go test ./...');
  });

  it('detects make test from Makefile with test target', async () => {
    await writeFile(join(repo.path, 'Makefile'), 'test:\n\techo "testing"\n');

    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('make test');
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

  it('detects npm install from package.json with dependencies', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ dependencies: { lodash: '^4.0.0' } })
    );

    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['npm install']);
  });

  it('detects npm install from package.json with devDependencies', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^1.0.0' } })
    );

    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['npm install']);
  });

  it('does not detect npm install from package.json without dependencies', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ name: 'bare-project' })
    );

    const config = await detectProvisioning(repo.path);
    expect(config.setup).toBeUndefined();
  });

  it('detects pip install from Pipfile', async () => {
    await writeFile(join(repo.path, 'Pipfile'), '[packages]\n');

    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['pip install -r requirements.txt']);
  });

  it('detects pip install -e from pyproject.toml', async () => {
    await writeFile(join(repo.path, 'pyproject.toml'), '[project]\nname = "myapp"\n');

    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['pip install -e .']);
  });

  it('detects go mod download from go.mod', async () => {
    await writeFile(join(repo.path, 'go.mod'), 'module example.com/test\n');

    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['go mod download']);
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

  it('detects Node.js from package.json', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({ name: 'test' }));

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Node.js (package.json)');
  });

  it('detects Python from pyproject.toml', async () => {
    await writeFile(join(repo.path, 'pyproject.toml'), '[project]\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Python (pyproject.toml)');
  });

  it('detects Python from Pipfile', async () => {
    await writeFile(join(repo.path, 'Pipfile'), '[packages]\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Python (Pipfile)');
  });

  it('detects Rust from Cargo.toml', async () => {
    await writeFile(join(repo.path, 'Cargo.toml'), '[package]\nname = "test"\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Rust (Cargo.toml)');
  });

  it('detects Go from go.mod', async () => {
    await writeFile(join(repo.path, 'go.mod'), 'module example.com/test\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Go (go.mod)');
  });

  it('detects Make from Makefile', async () => {
    await writeFile(join(repo.path, 'Makefile'), 'all:\n\techo "build"\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Make (Makefile)');
  });

  it('returns first match by priority when multiple files exist', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(repo.path, 'Makefile'), 'all:\n\techo "build"\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Node.js (package.json)');
  });
});

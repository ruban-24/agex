import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { detectVerifyCommands, detectProvisioning, detectProjectType, detectRunConfig } from '../../src/config/auto-detect.js';
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

  it('detects swift build and swift test from Package.swift', async () => {
    await writeFile(join(repo.path, 'Package.swift'), '// swift-tools-version: 5.9\n');
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('swift build');
    expect(cmds).toContain('swift test');
  });

  it('detects xcodegen generate and xcodebuild build from project.yml + xcodeproj', async () => {
    await writeFile(join(repo.path, 'project.yml'), 'name: MyApp\n');
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('xcodegen generate');
    expect(cmds).toContain('xcodebuild build');
  });

  it('detects xcodebuild build from plain xcodeproj without xcodegen', async () => {
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('xcodebuild build');
    expect(cmds).not.toContain('xcodegen generate');
  });

  it('does not detect xcode commands when Package.swift exists', async () => {
    await writeFile(join(repo.path, 'Package.swift'), '// swift-tools-version: 5.9\n');
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('swift build');
    expect(cmds).not.toContain('xcodebuild build');
  });

  it('detects xcodegen from project.yml even without xcodeproj directory', async () => {
    await writeFile(join(repo.path, 'project.yml'), 'name: MyApp\n');
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('xcodegen generate');
    expect(cmds).toContain('xcodebuild build');
  });

  it('detects swiftlint from .swiftlint.yml', async () => {
    await writeFile(join(repo.path, '.swiftlint.yml'), 'disabled_rules:\n  - line_length\n');
    const cmds = await detectVerifyCommands(repo.path);
    expect(cmds).toContain('swiftlint');
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

  it('detects SPM provisioning: swift package resolve setup and .build symlink', async () => {
    await writeFile(join(repo.path, 'Package.swift'), '// swift-tools-version: 5.9\n');
    await mkdir(join(repo.path, '.build'), { recursive: true });
    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['swift package resolve']);
    expect(config.symlink).toEqual(['.build']);
  });

  it('detects XcodeGen provisioning: xcodegen generate setup', async () => {
    await writeFile(join(repo.path, 'project.yml'), 'name: MyApp\n');
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const config = await detectProvisioning(repo.path);
    expect(config.setup).toEqual(['xcodegen generate']);
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

describe('detectRunConfig', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns null when nothing detected', async () => {
    const result = await detectRunConfig(repo.path);
    expect(result).toBeNull();
  });

  it('detects npm run dev from package.json scripts.dev', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { dev: 'next dev' } })
    );
    const result = await detectRunConfig(repo.path);
    expect(result).toEqual({ cmd: 'npm run dev', port_env: 'PORT' });
  });

  it('detects npm start from package.json scripts.start when no dev', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { start: 'node server.js' } })
    );
    const result = await detectRunConfig(repo.path);
    expect(result).toEqual({ cmd: 'npm start', port_env: 'PORT' });
  });

  it('prefers scripts.dev over scripts.start', async () => {
    await writeFile(
      join(repo.path, 'package.json'),
      JSON.stringify({ scripts: { dev: 'next dev', start: 'next start' } })
    );
    const result = await detectRunConfig(repo.path);
    expect(result).toEqual({ cmd: 'npm run dev', port_env: 'PORT' });
  });

  it('detects Django manage.py', async () => {
    await writeFile(join(repo.path, 'manage.py'), '#!/usr/bin/env python\n');
    const result = await detectRunConfig(repo.path);
    expect(result).toEqual({ cmd: 'python manage.py runserver 0.0.0.0:$AGEX_PORT' });
  });

  it('detects Flask from pyproject.toml', async () => {
    await writeFile(
      join(repo.path, 'pyproject.toml'),
      '[project]\ndependencies = ["flask"]\n'
    );
    const result = await detectRunConfig(repo.path);
    expect(result).toEqual({ cmd: 'flask run', port_env: 'FLASK_RUN_PORT' });
  });

  it('detects Rails from Gemfile', async () => {
    await writeFile(join(repo.path, 'Gemfile'), "source 'https://rubygems.org'\ngem 'rails'\n");
    const result = await detectRunConfig(repo.path);
    expect(result).toEqual({ cmd: 'bin/rails server', port_env: 'PORT' });
  });

  it('returns null for go.mod (too varied)', async () => {
    await writeFile(join(repo.path, 'go.mod'), 'module example.com/test\n');
    const result = await detectRunConfig(repo.path);
    expect(result).toBeNull();
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

  it('detects Swift (Package.swift)', async () => {
    await writeFile(join(repo.path, 'Package.swift'), '// swift-tools-version: 5.9\n');
    const type = await detectProjectType(repo.path);
    expect(type).toBe('Swift (Package.swift)');
  });

  it('detects Swift/Xcode (XcodeGen) from project.yml alone', async () => {
    await writeFile(join(repo.path, 'project.yml'), 'name: MyApp\n');
    const type = await detectProjectType(repo.path);
    expect(type).toBe('Swift/Xcode (XcodeGen)');
  });

  it('detects Swift/Xcode (.xcodeproj) from plain xcodeproj', async () => {
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const type = await detectProjectType(repo.path);
    expect(type).toBe('Swift/Xcode (.xcodeproj)');
  });

  it('prefers Package.swift over xcodeproj', async () => {
    await writeFile(join(repo.path, 'Package.swift'), '// swift-tools-version: 5.9\n');
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const type = await detectProjectType(repo.path);
    expect(type).toBe('Swift (Package.swift)');
  });

  it('prefers Package.swift over project.yml + xcodeproj combined', async () => {
    await writeFile(join(repo.path, 'Package.swift'), '// swift-tools-version: 5.9\n');
    await writeFile(join(repo.path, 'project.yml'), 'name: MyApp\n');
    await mkdir(join(repo.path, 'MyApp.xcodeproj'), { recursive: true });
    const type = await detectProjectType(repo.path);
    expect(type).toBe('Swift (Package.swift)');
  });

  it('detects XcodeGen even without existing xcodeproj directory', async () => {
    await writeFile(join(repo.path, 'project.yml'), 'name: MyApp\n');
    const type = await detectProjectType(repo.path);
    expect(type).toBe('Swift/Xcode (XcodeGen)');
  });

  it('returns first match by priority when multiple files exist', async () => {
    await writeFile(join(repo.path, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(repo.path, 'Makefile'), 'all:\n\techo "build"\n');

    const type = await detectProjectType(repo.path);
    expect(type).toBe('Node.js (package.json)');
  });
});

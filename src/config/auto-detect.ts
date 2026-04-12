import { readFile, readdir, access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgexConfig, RunConfig } from '../types.js';

export type ProvisioningConfig = Pick<AgexConfig, 'copy' | 'symlink' | 'setup'>;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function hasXcodeprojDir(repoRoot: string): Promise<boolean> {
  try {
    const entries = await readdir(repoRoot);
    return entries.some(e => e.endsWith('.xcodeproj'));
  } catch {
    return false;
  }
}

export async function detectVerifyCommands(repoRoot: string): Promise<string[]> {
  const commands: string[] = [];

  // Check package.json
  const pkgPath = join(repoRoot, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      if (scripts.test) commands.push('npm test');
      if (scripts.lint) commands.push('npm run lint');
      if (scripts.build) commands.push('npm run build');
    } catch {
      // Invalid JSON, skip
    }
  }

  // Check Makefile for test target
  const makefilePath = join(repoRoot, 'Makefile');
  if (await fileExists(makefilePath)) {
    try {
      const content = await readFile(makefilePath, 'utf-8');
      if (/^test\s*:/m.test(content)) {
        commands.push('make test');
      }
    } catch {
      // Skip
    }
  }

  // Check pyproject.toml
  if (await fileExists(join(repoRoot, 'pyproject.toml'))) {
    commands.push('pytest');
  }

  // Check Cargo.toml
  if (await fileExists(join(repoRoot, 'Cargo.toml'))) {
    commands.push('cargo test');
  }

  // Check go.mod
  if (await fileExists(join(repoRoot, 'go.mod'))) {
    commands.push('go test ./...');
  }

  // Check Package.swift (SPM)
  if (await fileExists(join(repoRoot, 'Package.swift'))) {
    commands.push('swift build');
    commands.push('swift test');
  }

  // Check for Xcode project (XcodeGen or plain)
  if (!await fileExists(join(repoRoot, 'Package.swift'))) {
    const hasXcodeGen = await fileExists(join(repoRoot, 'project.yml'));
    const hasXcodeproj = await hasXcodeprojDir(repoRoot);

    if (hasXcodeGen) {
      commands.push('xcodegen generate');
      commands.push('xcodebuild build');
    } else if (hasXcodeproj) {
      commands.push('xcodebuild build');
    }
  }

  // Check for SwiftLint
  if (await fileExists(join(repoRoot, '.swiftlint.yml'))) {
    commands.push('swiftlint');
  }

  return commands;
}

export async function detectProvisioning(repoRoot: string): Promise<ProvisioningConfig> {
  const config: ProvisioningConfig = {};

  // .env → copy
  if (await fileExists(join(repoRoot, '.env'))) {
    config.copy = ['.env'];
  }

  // node_modules/ → symlink
  if (await dirExists(join(repoRoot, 'node_modules'))) {
    config.symlink = ['node_modules'];
  }

  // package.json with dependencies/devDependencies → npm install
  const pkgPath = join(repoRoot, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      if (pkg.dependencies || pkg.devDependencies) {
        config.setup = ['npm install'];
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Pipfile → pipenv install
  if (!config.setup && await fileExists(join(repoRoot, 'Pipfile'))) {
    config.setup = ['pipenv install'];
  }

  // pyproject.toml → pip install -e .
  if (!config.setup && await fileExists(join(repoRoot, 'pyproject.toml'))) {
    config.setup = ['pip install -e .'];
  }

  // go.mod → go mod download
  if (!config.setup && await fileExists(join(repoRoot, 'go.mod'))) {
    config.setup = ['go mod download'];
  }

  // Package.swift (SPM) → symlink .build
  if (await fileExists(join(repoRoot, 'Package.swift'))) {
    if (await dirExists(join(repoRoot, '.build'))) {
      config.symlink = [...(config.symlink || []), '.build'];
    }
    if (!config.setup) {
      config.setup = ['swift package resolve'];
    }
  }

  // XcodeGen project → setup: xcodegen generate
  if (!await fileExists(join(repoRoot, 'Package.swift')) && await fileExists(join(repoRoot, 'project.yml'))) {
    if (!config.setup) {
      config.setup = ['xcodegen generate'];
    }
  }

  return config;
}

export async function detectRunConfig(repoRoot: string): Promise<RunConfig | null> {
  // package.json — check scripts.dev, then scripts.start
  const pkgPath = join(repoRoot, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      if (scripts.dev) {
        return { cmd: 'npm run dev', port_env: 'PORT' };
      }
      if (scripts.start) {
        return { cmd: 'npm start', port_env: 'PORT' };
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // manage.py — Django
  if (await fileExists(join(repoRoot, 'manage.py'))) {
    return { cmd: 'python manage.py runserver 0.0.0.0:$AGEX_PORT' };
  }

  // pyproject.toml with flask in dependencies
  const pyprojectPath = join(repoRoot, 'pyproject.toml');
  if (await fileExists(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, 'utf-8');
      if (/flask/i.test(content)) {
        return { cmd: 'flask run', port_env: 'FLASK_RUN_PORT' };
      }
    } catch {
      // Skip
    }
  }

  // Gemfile with rails
  const gemfilePath = join(repoRoot, 'Gemfile');
  if (await fileExists(gemfilePath)) {
    try {
      const content = await readFile(gemfilePath, 'utf-8');
      if (/rails/i.test(content)) {
        return { cmd: 'bin/rails server', port_env: 'PORT' };
      }
    } catch {
      // Skip
    }
  }

  return null;
}

export async function detectProjectType(repoRoot: string): Promise<string | null> {
  // Check Swift/Xcode first (more specific checks)
  if (await fileExists(join(repoRoot, 'Package.swift'))) {
    return 'Swift (Package.swift)';
  }
  if (await fileExists(join(repoRoot, 'project.yml'))) {
    return 'Swift/Xcode (XcodeGen)';
  }
  if (await hasXcodeprojDir(repoRoot)) {
    return 'Swift/Xcode (.xcodeproj)';
  }

  const checks: [string, string][] = [
    ['package.json', 'Node.js (package.json)'],
    ['pyproject.toml', 'Python (pyproject.toml)'],
    ['Pipfile', 'Python (Pipfile)'],
    ['Cargo.toml', 'Rust (Cargo.toml)'],
    ['go.mod', 'Go (go.mod)'],
    ['Makefile', 'Make (Makefile)'],
  ];

  for (const [file, label] of checks) {
    if (await fileExists(join(repoRoot, file))) {
      return label;
    }
  }

  return null;
}

export interface MonorepoInfo {
  type: string;
  label: string;
}

export async function detectMonorepo(repoRoot: string): Promise<MonorepoInfo | null> {
  // pnpm workspace
  if (await fileExists(join(repoRoot, 'pnpm-workspace.yaml'))) {
    return { type: 'pnpm', label: 'pnpm workspace' };
  }

  // npm/yarn workspace (package.json with "workspaces" field)
  const pkgPath = join(repoRoot, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        return { type: 'npm', label: 'npm/yarn workspace' };
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Lerna
  if (await fileExists(join(repoRoot, 'lerna.json'))) {
    return { type: 'lerna', label: 'Lerna monorepo' };
  }

  // Nx
  if (await fileExists(join(repoRoot, 'nx.json'))) {
    return { type: 'nx', label: 'Nx monorepo' };
  }

  // Turborepo
  if (await fileExists(join(repoRoot, 'turbo.json'))) {
    return { type: 'turbo', label: 'Turborepo' };
  }

  // Cargo workspace
  const cargoPath = join(repoRoot, 'Cargo.toml');
  if (await fileExists(cargoPath)) {
    try {
      const content = await readFile(cargoPath, 'utf-8');
      if (/^\[workspace\]/m.test(content)) {
        return { type: 'cargo', label: 'Cargo workspace' };
      }
    } catch {
      // Skip
    }
  }

  // Go workspace
  if (await fileExists(join(repoRoot, 'go.work'))) {
    return { type: 'go', label: 'Go workspace' };
  }

  return null;
}

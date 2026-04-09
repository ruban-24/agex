import { readFile, access, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProvisioningConfig {
  copy?: string[];
  symlink?: string[];
  setup?: string[];
}

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

  // Pipfile → pip install -r requirements.txt
  if (!config.setup && await fileExists(join(repoRoot, 'Pipfile'))) {
    config.setup = ['pip install -r requirements.txt'];
  }

  // pyproject.toml → pip install -e .
  if (!config.setup && await fileExists(join(repoRoot, 'pyproject.toml'))) {
    config.setup = ['pip install -e .'];
  }

  // go.mod → go mod download
  if (!config.setup && await fileExists(join(repoRoot, 'go.mod'))) {
    config.setup = ['go mod download'];
  }

  return config;
}

export async function detectProjectType(repoRoot: string): Promise<string | null> {
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

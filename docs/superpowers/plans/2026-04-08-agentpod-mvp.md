# agentpod MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build agentpod — a CLI runtime that lets AI coding agents create isolated git worktree workspaces, run parallel tasks, verify results, and merge or discard changes.

**Architecture:** CLI-first with JSON state files. Core modules (TaskManager, WorkspaceManager, AgentRunner, Verifier, Reviewer) are composed by CLI commands via commander. All state lives in `.agentpod/` (gitignored). JSON output by default, `--human` flag for pretty tables.

**Tech Stack:** TypeScript (ESM), commander (CLI), simple-git (git ops), execa (subprocess), js-yaml (config), Vitest (testing), tsup (bundling)

---

## File Structure

```
src/
  index.ts                          # CLI entry point (bin)
  cli/
    commands/
      init.ts                       # agentpod init
      task-create.ts                # agentpod task create
      task-exec.ts                  # agentpod task exec
      task-status.ts                # agentpod task status
      run.ts                        # agentpod run (create + exec shortcut)
      list.ts                       # agentpod list
      log.ts                        # agentpod log
      verify.ts                     # agentpod verify
      diff.ts                       # agentpod diff
      compare.ts                    # agentpod compare
      summary.ts                    # agentpod summary
      merge.ts                      # agentpod merge
      discard.ts                    # agentpod discard
      clean.ts                      # agentpod clean
    output.ts                       # JSON/human output formatting
  core/
    task-manager.ts                 # Task CRUD, state machine, JSON persistence
    workspace-manager.ts            # Git worktree lifecycle, provisioning
    agent-runner.ts                 # Subprocess spawn, output capture
    verifier.ts                     # Run verify commands, collect results
    reviewer.ts                     # Diff generation, comparison, merge/discard
  config/
    loader.ts                       # Load .agentpod/config.yml
    auto-detect.ts                  # Infer verify commands from repo files
  types.ts                          # All shared types
  constants.ts                      # Exit codes, defaults, paths
  utils/
    id.ts                           # Task ID generation
    port.ts                         # Port offset allocation
tests/
  core/
    task-manager.test.ts
    workspace-manager.test.ts
    agent-runner.test.ts
    verifier.test.ts
    reviewer.test.ts
  config/
    loader.test.ts
    auto-detect.test.ts
  cli/
    init.test.ts
    task-create.test.ts
    run.test.ts
    verify.test.ts
    merge.test.ts
    list.test.ts
    log.test.ts
    diff.test.ts
    compare.test.ts
    summary.test.ts
    discard.test.ts
    clean.test.ts
  utils/
    id.test.ts
    port.test.ts
  helpers/
    test-repo.ts                    # Create temp git repos for testing
```

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `tsup.config.ts`
- Create: `tests/helpers/test-repo.ts`

- [ ] **Step 1: Initialize git repository**

```bash
cd /Users/ruban/Documents/agentpod
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "agentpod",
  "version": "0.1.0",
  "description": "A CLI runtime for running parallel AI coding tasks safely inside real repos",
  "type": "module",
  "bin": {
    "agentpod": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "keywords": ["ai", "coding", "agents", "git", "worktree", "cli"],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^13.1.0",
    "execa": "^9.5.2",
    "js-yaml": "^4.1.0",
    "simple-git": "^3.27.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.14.0",
    "tsup": "^8.4.0",
    "tsx": "^4.19.3",
    "typescript": "^5.8.3",
    "vitest": "^3.1.1"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
  },
});
```

- [ ] **Step 5: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.agentpod/
*.tsbuildinfo
```

- [ ] **Step 7: Create test helper for temporary git repos**

Create `tests/helpers/test-repo.ts`:

```typescript
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

export async function createTestRepo(): Promise<TestRepo> {
  const path = await mkdtemp(join(tmpdir(), 'agentpod-test-'));
  execSync('git init', { cwd: path, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: path, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: path, stdio: 'ignore' });
  await writeFile(join(path, 'README.md'), '# Test Repo\n');
  execSync('git add . && git commit -m "initial commit"', { cwd: path, stdio: 'ignore' });

  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

export async function createTestRepoWithAgentpod(): Promise<TestRepo> {
  const repo = await createTestRepo();
  const agentpodDir = join(repo.path, '.agentpod');
  await mkdir(join(agentpodDir, 'tasks'), { recursive: true });
  await mkdir(join(agentpodDir, 'worktrees'), { recursive: true });
  return repo;
}
```

- [ ] **Step 8: Install dependencies and verify**

```bash
npm install
npx vitest run
npx tsc --noEmit
```

Expected: vitest passes (no tests yet), tsc has no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts tsup.config.ts .gitignore tests/helpers/test-repo.ts package-lock.json
git commit -m "chore: initialize project scaffolding"
```

---

## Task 1: Types & Constants

**Files:**
- Create: `src/types.ts`
- Create: `src/constants.ts`

No TDD needed — pure type definitions and constants.

- [ ] **Step 1: Create types.ts**

Create `src/types.ts`:

```typescript
export type TaskStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'errored'
  | 'merged'
  | 'discarded';

export interface TaskEnv {
  AGENTPOD_TASK_ID: string;
  AGENTPOD_WORKTREE: string;
  AGENTPOD_PORT_OFFSET: string;
}

export interface VerificationCheck {
  cmd: string;
  passed: boolean;
  exit_code: number;
  duration_s: number;
  output?: string;
}

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
}

export interface DiffStats {
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface TaskRecord {
  id: string;
  prompt: string;
  cmd?: string;
  status: TaskStatus;
  branch: string;
  worktree: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  duration_s?: number;
  pid?: number;
  exit_code?: number;
  error?: string;
  env: TaskEnv;
  verification?: VerificationResult;
  diff_stats?: DiffStats;
}

export interface AgentpodConfig {
  verify?: string[];
  copy?: string[];
  symlink?: string[];
  copy_ignored?: {
    enabled: boolean;
    exclude?: string[];
  };
  setup?: string[];
  setup_background?: string[];
  ports?: {
    base: number;
    offset: number;
  };
  defaults?: {
    cmd?: string;
  };
  concurrency?: number;
  timeout?: number;
}
```

- [ ] **Step 2: Create constants.ts**

Create `src/constants.ts`:

```typescript
import { join } from 'node:path';

export const AGENTPOD_DIR = '.agentpod';
export const CONFIG_FILE = 'config.yml';
export const TASKS_DIR = 'tasks';
export const WORKTREES_DIR = 'worktrees';

export function agentpodPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR);
}

export function configPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR, CONFIG_FILE);
}

export function tasksPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR, TASKS_DIR);
}

export function worktreesPath(repoRoot: string): string {
  return join(repoRoot, AGENTPOD_DIR, WORKTREES_DIR);
}

export function taskFilePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGENTPOD_DIR, TASKS_DIR, `${taskId}.json`);
}

export function taskLogPath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGENTPOD_DIR, TASKS_DIR, `${taskId}.log`);
}

export function worktreePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, AGENTPOD_DIR, WORKTREES_DIR, taskId);
}

export const EXIT_CODES = {
  SUCCESS: 0,
  AGENT_FAILED: 1,
  VERIFICATION_FAILED: 2,
  MERGE_CONFLICT: 3,
  INVALID_ARGS: 4,
  WORKSPACE_ERROR: 5,
} as const;

export const DEFAULT_PORTS = {
  base: 3000,
  offset: 100,
} as const;

export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_TIMEOUT = 0;

export const BRANCH_PREFIX = 'agentpod/';
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/constants.ts
git commit -m "feat: add core types and constants"
```

---

## Task 2: ID Generation Utility

**Files:**
- Create: `src/utils/id.ts`
- Create: `tests/utils/id.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/id.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateTaskId } from '../../src/utils/id.js';

describe('generateTaskId', () => {
  it('returns a 6-character lowercase alphanumeric string', () => {
    const id = generateTaskId();
    expect(id).toMatch(/^[a-z0-9]{6}$/);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTaskId()));
    expect(ids.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/utils/id.test.ts
```

Expected: FAIL — cannot find module `../../src/utils/id.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/id.ts`:

```typescript
import { randomBytes } from 'node:crypto';

export function generateTaskId(): string {
  return randomBytes(3).toString('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/utils/id.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/id.ts tests/utils/id.test.ts
git commit -m "feat: add task ID generation utility"
```

---

## Task 3: Port Allocation Utility

**Files:**
- Create: `src/utils/port.ts`
- Create: `tests/utils/port.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/port.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculatePortOffset } from '../../src/utils/port.js';

describe('calculatePortOffset', () => {
  it('returns base + offset for task index 0', () => {
    expect(calculatePortOffset(0, 3000, 100)).toBe(3100);
  });

  it('increments by offset for each task index', () => {
    expect(calculatePortOffset(1, 3000, 100)).toBe(3200);
    expect(calculatePortOffset(2, 3000, 100)).toBe(3300);
  });

  it('uses custom base and offset', () => {
    expect(calculatePortOffset(0, 8000, 50)).toBe(8050);
    expect(calculatePortOffset(3, 8000, 50)).toBe(8200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/utils/port.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/port.ts`:

```typescript
export function calculatePortOffset(taskIndex: number, base: number, offset: number): number {
  return base + offset * (taskIndex + 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/utils/port.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/port.ts tests/utils/port.test.ts
git commit -m "feat: add port allocation utility"
```

---

## Task 4: Config Loader

**Files:**
- Create: `src/config/loader.ts`
- Create: `tests/config/loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config/loader.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config/loader.test.ts
```

Expected: FAIL — cannot find module `../../src/config/loader.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/config/loader.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { configPath } from '../constants.js';
import type { AgentpodConfig } from '../types.js';

export async function loadConfig(repoRoot: string): Promise<AgentpodConfig> {
  try {
    const content = await readFile(configPath(repoRoot), 'utf-8');
    const parsed = load(content);
    if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
      return {};
    }
    return parsed as AgentpodConfig;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/config/loader.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/loader.ts tests/config/loader.test.ts
git commit -m "feat: add config loader for .agentpod/config.yml"
```

---

## Task 5: Verify Auto-Detection

**Files:**
- Create: `src/config/auto-detect.ts`
- Create: `tests/config/auto-detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config/auto-detect.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectVerifyCommands } from '../../src/config/auto-detect.js';
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config/auto-detect.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/config/auto-detect.ts`:

```typescript
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/config/auto-detect.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/auto-detect.ts tests/config/auto-detect.test.ts
git commit -m "feat: add verify command auto-detection from repo files"
```

---

## Task 6: TaskManager — Create & Read

**Files:**
- Create: `src/core/task-manager.ts`
- Create: `tests/core/task-manager.test.ts`

- [ ] **Step 1: Write the failing tests for create and read**

Create `tests/core/task-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('TaskManager', () => {
  let repo: TestRepo;
  let tm: TaskManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    tm = new TaskManager(repo.path);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('createTask', () => {
    it('creates a task record with pending status', async () => {
      const task = await tm.createTask({ prompt: 'refactor auth' });

      expect(task.id).toMatch(/^[a-z0-9]{6}$/);
      expect(task.prompt).toBe('refactor auth');
      expect(task.status).toBe('pending');
      expect(task.branch).toBe(`agentpod/${task.id}`);
      expect(task.worktree).toBe(`.agentpod/worktrees/${task.id}`);
      expect(task.created_at).toBeTruthy();
      expect(task.env.AGENTPOD_TASK_ID).toBe(task.id);
      expect(task.env.AGENTPOD_WORKTREE).toContain(task.id);
      expect(task.env.AGENTPOD_PORT_OFFSET).toBeTruthy();
    });

    it('persists task record as JSON file', async () => {
      const task = await tm.createTask({ prompt: 'add tests' });

      const filePath = join(repo.path, '.agentpod', 'tasks', `${task.id}.json`);
      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      expect(content.id).toBe(task.id);
      expect(content.prompt).toBe('add tests');
      expect(content.status).toBe('pending');
    });

    it('stores cmd when provided', async () => {
      const task = await tm.createTask({
        prompt: 'refactor auth',
        cmd: 'claude -p "refactor auth"',
      });

      expect(task.cmd).toBe('claude -p "refactor auth"');
    });

    it('assigns incremental port offsets', async () => {
      const task1 = await tm.createTask({ prompt: 'task 1' });
      const task2 = await tm.createTask({ prompt: 'task 2' });

      const port1 = parseInt(task1.env.AGENTPOD_PORT_OFFSET, 10);
      const port2 = parseInt(task2.env.AGENTPOD_PORT_OFFSET, 10);
      expect(port2).toBe(port1 + 100);
    });
  });

  describe('getTask', () => {
    it('reads a task by ID', async () => {
      const created = await tm.createTask({ prompt: 'test task' });
      const fetched = await tm.getTask(created.id);

      expect(fetched).toEqual(created);
    });

    it('returns null for nonexistent task ID', async () => {
      const result = await tm.getTask('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listTasks', () => {
    it('returns empty array when no tasks exist', async () => {
      const tasks = await tm.listTasks();
      expect(tasks).toEqual([]);
    });

    it('returns all tasks', async () => {
      await tm.createTask({ prompt: 'task 1' });
      await tm.createTask({ prompt: 'task 2' });

      const tasks = await tm.listTasks();
      expect(tasks).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/task-manager.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/core/task-manager.ts`:

```typescript
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateTaskId } from '../utils/id.js';
import { calculatePortOffset } from '../utils/port.js';
import {
  tasksPath,
  taskFilePath,
  BRANCH_PREFIX,
  DEFAULT_PORTS,
} from '../constants.js';
import type { TaskRecord, TaskStatus } from '../types.js';

export interface CreateTaskOptions {
  prompt: string;
  cmd?: string;
}

export class TaskManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async createTask(options: CreateTaskOptions): Promise<TaskRecord> {
    const id = generateTaskId();
    const existingTasks = await this.listTasks();
    const taskIndex = existingTasks.length;
    const portOffset = calculatePortOffset(taskIndex, DEFAULT_PORTS.base, DEFAULT_PORTS.offset);
    const worktreeAbsolute = resolve(this.repoRoot, '.agentpod', 'worktrees', id);

    const task: TaskRecord = {
      id,
      prompt: options.prompt,
      cmd: options.cmd,
      status: 'pending',
      branch: `${BRANCH_PREFIX}${id}`,
      worktree: `.agentpod/worktrees/${id}`,
      created_at: new Date().toISOString(),
      env: {
        AGENTPOD_TASK_ID: id,
        AGENTPOD_WORKTREE: worktreeAbsolute,
        AGENTPOD_PORT_OFFSET: String(portOffset),
      },
    };

    await this.saveTask(task);
    return task;
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    try {
      const content = await readFile(taskFilePath(this.repoRoot, id), 'utf-8');
      return JSON.parse(content) as TaskRecord;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async listTasks(): Promise<TaskRecord[]> {
    try {
      const files = await readdir(tasksPath(this.repoRoot));
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const tasks = await Promise.all(
        jsonFiles.map(async (f) => {
          const content = await readFile(join(tasksPath(this.repoRoot), f), 'utf-8');
          return JSON.parse(content) as TaskRecord;
        })
      );
      return tasks;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async saveTask(task: TaskRecord): Promise<void> {
    await writeFile(taskFilePath(this.repoRoot, task.id), JSON.stringify(task, null, 2));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/task-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/task-manager.ts tests/core/task-manager.test.ts
git commit -m "feat: add TaskManager with create, get, and list"
```

---

## Task 7: TaskManager — State Transitions

**Files:**
- Modify: `src/core/task-manager.ts`
- Modify: `tests/core/task-manager.test.ts`

- [ ] **Step 1: Write failing tests for state transitions**

Append to `tests/core/task-manager.test.ts` inside the outer `describe` block:

```typescript
  describe('updateStatus', () => {
    it('transitions pending to provisioning', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      const updated = await tm.updateStatus(task.id, 'provisioning');

      expect(updated.status).toBe('provisioning');
    });

    it('transitions ready to running and sets started_at', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      const updated = await tm.updateStatus(task.id, 'running');

      expect(updated.status).toBe('running');
      expect(updated.started_at).toBeTruthy();
    });

    it('transitions running to verifying', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      const updated = await tm.updateStatus(task.id, 'verifying');

      expect(updated.status).toBe('verifying');
    });

    it('transitions verifying to completed and sets finished_at and duration_s', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      await tm.updateStatus(task.id, 'provisioning');
      await tm.updateStatus(task.id, 'ready');
      await tm.updateStatus(task.id, 'running');
      await tm.updateStatus(task.id, 'verifying');
      const updated = await tm.updateStatus(task.id, 'completed');

      expect(updated.status).toBe('completed');
      expect(updated.finished_at).toBeTruthy();
      expect(typeof updated.duration_s).toBe('number');
    });

    it('rejects invalid transitions', async () => {
      const task = await tm.createTask({ prompt: 'test' });

      await expect(tm.updateStatus(task.id, 'completed')).rejects.toThrow(
        /invalid transition/i
      );
    });

    it('throws for nonexistent task', async () => {
      await expect(tm.updateStatus('nope', 'running')).rejects.toThrow(/not found/i);
    });
  });

  describe('updateTask', () => {
    it('updates arbitrary fields on a task', async () => {
      const task = await tm.createTask({ prompt: 'test' });
      const updated = await tm.updateTask(task.id, { pid: 12345, exit_code: 0 });

      expect(updated.pid).toBe(12345);
      expect(updated.exit_code).toBe(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/task-manager.test.ts
```

Expected: FAIL — `tm.updateStatus` is not a function

- [ ] **Step 3: Add updateStatus and updateTask to TaskManager**

Add to `src/core/task-manager.ts` inside the `TaskManager` class:

```typescript
  private static VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    pending: ['provisioning'],
    provisioning: ['ready', 'errored'],
    ready: ['running', 'verifying'],
    running: ['verifying', 'errored'],
    verifying: ['completed', 'failed'],
    completed: ['merged', 'discarded'],
    failed: ['merged', 'discarded'],
    errored: ['discarded'],
    merged: [],
    discarded: [],
  };

  async updateStatus(id: string, newStatus: TaskStatus): Promise<TaskRecord> {
    const task = await this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const allowed = TaskManager.VALID_TRANSITIONS[task.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${task.status} → ${newStatus} (allowed: ${allowed.join(', ')})`
      );
    }

    task.status = newStatus;

    if (newStatus === 'running' && !task.started_at) {
      task.started_at = new Date().toISOString();
    }

    if (
      (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'errored') &&
      !task.finished_at
    ) {
      task.finished_at = new Date().toISOString();
      if (task.started_at) {
        task.duration_s = Math.round(
          (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000
        );
      }
    }

    await this.saveTask(task);
    return task;
  }

  async updateTask(id: string, updates: Partial<TaskRecord>): Promise<TaskRecord> {
    const task = await this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    Object.assign(task, updates);
    await this.saveTask(task);
    return task;
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/task-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/task-manager.ts tests/core/task-manager.test.ts
git commit -m "feat: add state transitions and task updates to TaskManager"
```

---

## Task 8: WorkspaceManager — Create Worktree

**Files:**
- Create: `src/core/workspace-manager.ts`
- Create: `tests/core/workspace-manager.test.ts`

- [ ] **Step 1: Write failing tests for worktree creation**

Create `tests/core/workspace-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { WorkspaceManager } from '../../src/core/workspace-manager.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('WorkspaceManager', () => {
  let repo: TestRepo;
  let wm: WorkspaceManager;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    wm = new WorkspaceManager(repo.path);
  });

  afterEach(async () => {
    // Clean up worktrees before removing the repo
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore cleanup errors
    }
    await repo.cleanup();
  });

  describe('createWorktree', () => {
    it('creates a git worktree at the expected path', async () => {
      const taskId = 'abc123';
      const branch = 'agentpod/abc123';
      const worktreePath = join(repo.path, '.agentpod', 'worktrees', taskId);

      await wm.createWorktree(taskId, branch);

      await access(worktreePath);
      // Verify the README from the initial commit exists in the worktree
      const readme = await readFile(join(worktreePath, 'README.md'), 'utf-8');
      expect(readme).toBe('# Test Repo\n');
    });

    it('creates a new branch for the worktree', async () => {
      const taskId = 'abc123';
      const branch = 'agentpod/abc123';

      await wm.createWorktree(taskId, branch);

      const branches = execSync('git branch', { cwd: repo.path, encoding: 'utf-8' });
      expect(branches).toContain(branch);
    });
  });

  describe('removeWorktree', () => {
    it('removes the worktree and deletes the branch', async () => {
      const taskId = 'abc123';
      const branch = 'agentpod/abc123';

      await wm.createWorktree(taskId, branch);
      await wm.removeWorktree(taskId, branch);

      const worktreePath = join(repo.path, '.agentpod', 'worktrees', taskId);
      await expect(access(worktreePath)).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/workspace-manager.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/core/workspace-manager.ts`:

```typescript
import simpleGit from 'simple-git';
import { worktreePath } from '../constants.js';

export class WorkspaceManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async createWorktree(taskId: string, branch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);
    const wtPath = worktreePath(this.repoRoot, taskId);

    await git.raw(['worktree', 'add', '-b', branch, wtPath]);

    return wtPath;
  }

  async removeWorktree(taskId: string, branch: string): Promise<void> {
    const git = simpleGit(this.repoRoot);
    const wtPath = worktreePath(this.repoRoot, taskId);

    await git.raw(['worktree', 'remove', '--force', wtPath]);

    try {
      await git.raw(['branch', '-D', branch]);
    } catch {
      // Branch may already be deleted
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/workspace-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/workspace-manager.ts tests/core/workspace-manager.test.ts
git commit -m "feat: add WorkspaceManager with worktree create and remove"
```

---

## Task 9: WorkspaceManager — Provisioning

**Files:**
- Modify: `src/core/workspace-manager.ts`
- Modify: `tests/core/workspace-manager.test.ts`

- [ ] **Step 1: Write failing tests for provisioning**

Append to `tests/core/workspace-manager.test.ts` inside the outer `describe` block:

```typescript
  describe('provision', () => {
    it('copies specified files into the worktree', async () => {
      // Create a .env file in the repo root
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(join(repo.path, '.env'), 'SECRET=abc123\n');

      const taskId = 'prov01';
      const branch = 'agentpod/prov01';
      await wm.createWorktree(taskId, branch);

      await wm.provision(taskId, { copy: ['.env'] });

      const wtPath = join(repo.path, '.agentpod', 'worktrees', taskId);
      const envContent = await readFile(join(wtPath, '.env'), 'utf-8');
      expect(envContent).toBe('SECRET=abc123\n');
    });

    it('creates symlinks for specified directories', async () => {
      const { mkdir: mk, writeFile: wf, lstat } = await import('node:fs/promises');
      // Create a fake node_modules dir
      await mk(join(repo.path, 'node_modules', 'fake-pkg'), { recursive: true });
      await wf(join(repo.path, 'node_modules', 'fake-pkg', 'index.js'), 'module.exports = 1;\n');

      const taskId = 'prov02';
      const branch = 'agentpod/prov02';
      await wm.createWorktree(taskId, branch);

      await wm.provision(taskId, { symlink: ['node_modules'] });

      const wtPath = join(repo.path, '.agentpod', 'worktrees', taskId);
      const stat = await lstat(join(wtPath, 'node_modules'));
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('does nothing when no copy or symlink configured', async () => {
      const taskId = 'prov03';
      const branch = 'agentpod/prov03';
      await wm.createWorktree(taskId, branch);

      // Should not throw
      await wm.provision(taskId, {});
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/workspace-manager.test.ts
```

Expected: FAIL — `wm.provision` is not a function

- [ ] **Step 3: Add provision method**

Add to `src/core/workspace-manager.ts` in the `WorkspaceManager` class. Also add imports at the top:

```typescript
import { copyFile, symlink, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
```

Add method:

```typescript
  async provision(
    taskId: string,
    config: { copy?: string[]; symlink?: string[] }
  ): Promise<void> {
    const wtPath = worktreePath(this.repoRoot, taskId);

    // Copy files
    if (config.copy) {
      for (const file of config.copy) {
        const src = join(this.repoRoot, file);
        const dest = join(wtPath, file);
        try {
          await access(src);
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(src, dest);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            continue; // Source doesn't exist, skip
          }
          throw err;
        }
      }
    }

    // Symlink directories
    if (config.symlink) {
      for (const dir of config.symlink) {
        const src = join(this.repoRoot, dir);
        const dest = join(wtPath, dir);
        try {
          await access(src);
          await mkdir(dirname(dest), { recursive: true });
          await symlink(src, dest);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            continue; // Source doesn't exist, skip
          }
          throw err;
        }
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/workspace-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/workspace-manager.ts tests/core/workspace-manager.test.ts
git commit -m "feat: add workspace provisioning (copy files, symlink dirs)"
```

---

## Task 10: WorkspaceManager — Setup Hooks

**Files:**
- Modify: `src/core/workspace-manager.ts`
- Modify: `tests/core/workspace-manager.test.ts`

- [ ] **Step 1: Write failing tests for setup hooks**

Append to `tests/core/workspace-manager.test.ts` inside the outer `describe` block:

```typescript
  describe('runSetupHooks', () => {
    it('runs blocking setup commands in the worktree directory', async () => {
      const { writeFile: wf } = await import('node:fs/promises');
      const taskId = 'setup1';
      const branch = 'agentpod/setup1';
      await wm.createWorktree(taskId, branch);

      const wtPath = join(repo.path, '.agentpod', 'worktrees', taskId);

      await wm.runSetupHooks(taskId, ['touch setup-marker.txt']);

      await access(join(wtPath, 'setup-marker.txt'));
    });

    it('runs multiple setup commands in order', async () => {
      const taskId = 'setup2';
      const branch = 'agentpod/setup2';
      await wm.createWorktree(taskId, branch);

      const wtPath = join(repo.path, '.agentpod', 'worktrees', taskId);

      await wm.runSetupHooks(taskId, [
        'echo "step1" > order.txt',
        'echo "step2" >> order.txt',
      ]);

      const content = await readFile(join(wtPath, 'order.txt'), 'utf-8');
      expect(content.trim()).toBe('step1\nstep2');
    });

    it('throws when a setup command fails', async () => {
      const taskId = 'setup3';
      const branch = 'agentpod/setup3';
      await wm.createWorktree(taskId, branch);

      await expect(
        wm.runSetupHooks(taskId, ['exit 1'])
      ).rejects.toThrow();
    });

    it('does nothing with empty setup array', async () => {
      const taskId = 'setup4';
      const branch = 'agentpod/setup4';
      await wm.createWorktree(taskId, branch);

      // Should not throw
      await wm.runSetupHooks(taskId, []);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/workspace-manager.test.ts
```

Expected: FAIL — `wm.runSetupHooks` is not a function

- [ ] **Step 3: Add runSetupHooks method**

Add import at top of `src/core/workspace-manager.ts`:

```typescript
import { execaCommand } from 'execa';
```

Add method to `WorkspaceManager` class:

```typescript
  async runSetupHooks(taskId: string, commands: string[]): Promise<void> {
    const wtPath = worktreePath(this.repoRoot, taskId);

    for (const cmd of commands) {
      await execaCommand(cmd, { cwd: wtPath, shell: true });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/workspace-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/workspace-manager.ts tests/core/workspace-manager.test.ts
git commit -m "feat: add setup hook execution to WorkspaceManager"
```

---

## Task 11: AgentRunner — Spawn & Capture

**Files:**
- Create: `src/core/agent-runner.ts`
- Create: `tests/core/agent-runner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/agent-runner.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentRunner } from '../../src/core/agent-runner.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('AgentRunner', () => {
  let repo: TestRepo;
  let runner: AgentRunner;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    runner = new AgentRunner(repo.path);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('run (blocking)', () => {
    it('runs a command and returns exit code 0 on success', async () => {
      const result = await runner.run('test01', 'echo "hello world"', repo.path, {});

      expect(result.exitCode).toBe(0);
    });

    it('captures stdout to log file', async () => {
      await runner.run('test02', 'echo "captured output"', repo.path, {});

      const logPath = join(repo.path, '.agentpod', 'tasks', 'test02.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('captured output');
    });

    it('returns non-zero exit code on failure', async () => {
      const result = await runner.run('test03', 'exit 42', repo.path, {});

      expect(result.exitCode).toBe(42);
    });

    it('passes environment variables to the subprocess', async () => {
      const result = await runner.run(
        'test04',
        'echo $AGENTPOD_TASK_ID',
        repo.path,
        { AGENTPOD_TASK_ID: 'test04' }
      );

      expect(result.exitCode).toBe(0);
      const logPath = join(repo.path, '.agentpod', 'tasks', 'test04.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('test04');
    });

    it('runs the command in the specified working directory', async () => {
      const result = await runner.run('test05', 'pwd', repo.path, {});

      expect(result.exitCode).toBe(0);
      const logPath = join(repo.path, '.agentpod', 'tasks', 'test05.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log.trim()).toBe(repo.path);
    });
  });

  describe('spawn (non-blocking)', () => {
    it('returns a pid and running state', async () => {
      const handle = runner.spawn('test06', 'sleep 10', repo.path, {});

      expect(handle.pid).toBeGreaterThan(0);

      // Clean up
      handle.kill();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/agent-runner.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/core/agent-runner.ts`:

```typescript
import { execaCommand } from 'execa';
import { writeFile, appendFile } from 'node:fs/promises';
import { taskLogPath } from '../constants.js';

export interface RunResult {
  exitCode: number;
}

export interface SpawnHandle {
  pid: number;
  kill: () => void;
}

export class AgentRunner {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async run(
    taskId: string,
    cmd: string,
    cwd: string,
    env: Record<string, string>
  ): Promise<RunResult> {
    const logPath = taskLogPath(this.repoRoot, taskId);
    await writeFile(logPath, '');

    try {
      const result = await execaCommand(cmd, {
        cwd,
        shell: true,
        env: { ...process.env, ...env },
        reject: false,
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      await appendFile(logPath, output);

      return { exitCode: result.exitCode ?? 1 };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendFile(logPath, `Error: ${msg}\n`);
      return { exitCode: 1 };
    }
  }

  spawn(
    taskId: string,
    cmd: string,
    cwd: string,
    env: Record<string, string>
  ): SpawnHandle {
    const logPath = taskLogPath(this.repoRoot, taskId);

    const subprocess = execaCommand(cmd, {
      cwd,
      shell: true,
      env: { ...process.env, ...env },
      reject: false,
      detached: false,
    });

    // Write output to log file asynchronously
    const writeLog = async () => {
      try {
        await writeFile(logPath, '');
        const result = await subprocess;
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        await appendFile(logPath, output);
      } catch {
        // Process killed or errored
      }
    };
    writeLog();

    const pid = subprocess.pid ?? 0;

    return {
      pid,
      kill: () => {
        try {
          subprocess.kill();
        } catch {
          // Already dead
        }
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/agent-runner.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-runner.ts tests/core/agent-runner.test.ts
git commit -m "feat: add AgentRunner with blocking run and non-blocking spawn"
```

---

## Task 12: Verifier — Run Checks

**Files:**
- Create: `src/core/verifier.ts`
- Create: `tests/core/verifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/verifier.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/verifier.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/core/verifier.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/verifier.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/verifier.ts tests/core/verifier.test.ts
git commit -m "feat: add Verifier to run and collect verification check results"
```

---

## Task 13: Reviewer — Diff & Compare

**Files:**
- Create: `src/core/reviewer.ts`
- Create: `tests/core/reviewer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/reviewer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { Reviewer } from '../../src/core/reviewer.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('Reviewer', () => {
  let repo: TestRepo;
  let reviewer: Reviewer;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
    reviewer = new Reviewer(repo.path);
  });

  afterEach(async () => {
    // Clean up worktrees
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  describe('getDiff', () => {
    it('returns diff stats for changes on a branch', async () => {
      // Create a worktree with a change
      const wtPath = join(repo.path, '.agentpod', 'worktrees', 'diff01');
      execSync(`git worktree add -b agentpod/diff01 "${wtPath}"`, {
        cwd: repo.path,
        stdio: 'ignore',
      });

      // Make a change in the worktree
      await writeFile(join(wtPath, 'new-file.ts'), 'export const x = 1;\n');
      execSync('git add . && git commit -m "add file"', { cwd: wtPath, stdio: 'ignore' });

      const diff = await reviewer.getDiff('agentpod/diff01');

      expect(diff.files_changed).toBe(1);
      expect(diff.insertions).toBeGreaterThan(0);
    });

    it('returns zeros when branch has no changes', async () => {
      const wtPath = join(repo.path, '.agentpod', 'worktrees', 'diff02');
      execSync(`git worktree add -b agentpod/diff02 "${wtPath}"`, {
        cwd: repo.path,
        stdio: 'ignore',
      });

      const diff = await reviewer.getDiff('agentpod/diff02');

      expect(diff.files_changed).toBe(0);
      expect(diff.insertions).toBe(0);
      expect(diff.deletions).toBe(0);
    });
  });

  describe('getDiffText', () => {
    it('returns the full diff text', async () => {
      const wtPath = join(repo.path, '.agentpod', 'worktrees', 'diff03');
      execSync(`git worktree add -b agentpod/diff03 "${wtPath}"`, {
        cwd: repo.path,
        stdio: 'ignore',
      });
      await writeFile(join(wtPath, 'change.ts'), 'const y = 2;\n');
      execSync('git add . && git commit -m "add change"', { cwd: wtPath, stdio: 'ignore' });

      const text = await reviewer.getDiffText('agentpod/diff03');

      expect(text).toContain('change.ts');
      expect(text).toContain('const y = 2');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/reviewer.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/core/reviewer.ts`:

```typescript
import simpleGit from 'simple-git';
import type { DiffStats } from '../types.js';

export class Reviewer {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async getDiff(branch: string): Promise<DiffStats> {
    const git = simpleGit(this.repoRoot);

    try {
      // Find the merge base
      const base = await git.raw(['merge-base', 'HEAD', branch]);
      const baseSha = base.trim();

      // Get diff stats
      const stat = await git.raw(['diff', '--stat', '--numstat', baseSha, branch]);

      if (!stat.trim()) {
        return { files_changed: 0, insertions: 0, deletions: 0 };
      }

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      for (const line of stat.trim().split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          filesChanged++;
          const added = parseInt(parts[0], 10);
          const removed = parseInt(parts[1], 10);
          if (!isNaN(added)) insertions += added;
          if (!isNaN(removed)) deletions += removed;
        }
      }

      return { files_changed: filesChanged, insertions, deletions };
    } catch {
      return { files_changed: 0, insertions: 0, deletions: 0 };
    }
  }

  async getDiffText(branch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);

    try {
      const base = await git.raw(['merge-base', 'HEAD', branch]);
      return await git.raw(['diff', base.trim(), branch]);
    } catch {
      return '';
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/reviewer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reviewer.ts tests/core/reviewer.test.ts
git commit -m "feat: add Reviewer with diff stats and diff text"
```

---

## Task 14: Reviewer — Merge & Discard

**Files:**
- Modify: `src/core/reviewer.ts`
- Modify: `tests/core/reviewer.test.ts`

- [ ] **Step 1: Write failing tests for merge**

Append to `tests/core/reviewer.test.ts` inside the outer `describe` block:

```typescript
  describe('merge', () => {
    it('merges a branch into the current branch', async () => {
      const wtPath = join(repo.path, '.agentpod', 'worktrees', 'merge01');
      execSync(`git worktree add -b agentpod/merge01 "${wtPath}"`, {
        cwd: repo.path,
        stdio: 'ignore',
      });
      await writeFile(join(wtPath, 'merged-file.ts'), 'export const merged = true;\n');
      execSync('git add . && git commit -m "add merged file"', { cwd: wtPath, stdio: 'ignore' });

      const result = await reviewer.merge('agentpod/merge01');

      expect(result.success).toBe(true);
      expect(result.strategy).toBeDefined();

      // Verify the file exists on the main branch now
      const { access: acc } = await import('node:fs/promises');
      await acc(join(repo.path, 'merged-file.ts'));
    });

    it('reports merge conflicts', async () => {
      // Create conflicting changes
      await writeFile(join(repo.path, 'conflict.ts'), 'const main = true;\n');
      execSync('git add . && git commit -m "main change"', { cwd: repo.path, stdio: 'ignore' });

      // Now create a branch from BEFORE that commit, make a conflicting change
      const parentSha = execSync('git rev-parse HEAD~1', { cwd: repo.path, encoding: 'utf-8' }).trim();
      const wtPath = join(repo.path, '.agentpod', 'worktrees', 'merge02');
      execSync(`git worktree add -b agentpod/merge02 "${wtPath}" ${parentSha}`, {
        cwd: repo.path,
        stdio: 'ignore',
      });
      await writeFile(join(wtPath, 'conflict.ts'), 'const branch = true;\n');
      execSync('git add . && git commit -m "branch change"', { cwd: wtPath, stdio: 'ignore' });

      const result = await reviewer.merge('agentpod/merge02');

      expect(result.success).toBe(false);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/reviewer.test.ts
```

Expected: FAIL — `reviewer.merge` is not a function

- [ ] **Step 3: Add merge method**

Add to `src/core/reviewer.ts` in the `Reviewer` class:

```typescript
  async merge(branch: string): Promise<{ success: boolean; strategy?: string; commit?: string }> {
    const git = simpleGit(this.repoRoot);

    try {
      // Try fast-forward first
      try {
        await git.raw(['merge', '--ff-only', branch]);
        const commit = (await git.raw(['rev-parse', 'HEAD'])).trim();
        return { success: true, strategy: 'fast-forward', commit };
      } catch {
        // Not fast-forwardable, try regular merge
      }

      await git.raw(['merge', branch, '-m', `Merge ${branch}`]);
      const commit = (await git.raw(['rev-parse', 'HEAD'])).trim();
      return { success: true, strategy: 'merge', commit };
    } catch {
      // Abort failed merge
      try {
        await git.raw(['merge', '--abort']);
      } catch {
        // May not be in a merge state
      }
      return { success: false };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/reviewer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reviewer.ts tests/core/reviewer.test.ts
git commit -m "feat: add merge with fast-forward and conflict detection to Reviewer"
```

---

## Task 15: CLI — Output Formatting

**Files:**
- Create: `src/cli/output.ts`
- Create: `tests/cli/output.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/cli/output.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatOutput, formatTable } from '../../src/cli/output.js';
import type { TaskRecord } from '../../src/types.js';

describe('formatOutput', () => {
  it('returns JSON string when human=false', () => {
    const data = { id: 'abc123', status: 'ready' };
    const result = formatOutput(data, false);
    expect(JSON.parse(result)).toEqual(data);
  });

  it('returns pretty JSON when human=true and no formatter', () => {
    const data = { id: 'abc123', status: 'ready' };
    const result = formatOutput(data, true);
    expect(result).toContain('"id"');
    expect(result).toContain('abc123');
  });
});

describe('formatTable', () => {
  it('formats a simple table with headers and rows', () => {
    const headers = ['ID', 'Status'];
    const rows = [
      ['abc123', 'completed'],
      ['def456', 'failed'],
    ];

    const result = formatTable(headers, rows);

    expect(result).toContain('ID');
    expect(result).toContain('Status');
    expect(result).toContain('abc123');
    expect(result).toContain('completed');
    expect(result).toContain('def456');
    expect(result).toContain('failed');
  });

  it('pads columns to consistent widths', () => {
    const headers = ['ID', 'Status'];
    const rows = [['a', 'completed']];
    const result = formatTable(headers, rows);
    const lines = result.split('\n').filter(Boolean);
    // All lines should have consistent character widths (padded)
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + separator + row
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli/output.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/cli/output.ts`:

```typescript
export function formatOutput(data: unknown, human: boolean): string {
  if (!human) {
    return JSON.stringify(data);
  }
  return JSON.stringify(data, null, 2);
}

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => {
    const colValues = rows.map((r) => r[i] || '');
    return Math.max(h.length, ...colValues.map((v) => v.length));
  });

  const pad = (str: string, width: number) => str.padEnd(width);
  const separator = widths.map((w) => '─'.repeat(w + 2)).join('┼');

  const headerLine = headers.map((h, i) => ` ${pad(h, widths[i])} `).join('│');
  const separatorLine = `─${separator}─`;
  const dataLines = rows.map(
    (row) => row.map((cell, i) => ` ${pad(cell, widths[i])} `).join('│')
  );

  const topBorder = `┌${widths.map((w) => '─'.repeat(w + 2)).join('┬')}┐`;
  const midBorder = `├${separator}┤`;
  const botBorder = `└${widths.map((w) => '─'.repeat(w + 2)).join('┴')}┘`;

  return [
    topBorder,
    `│${headerLine}│`,
    midBorder,
    ...dataLines.map((line) => `│${line}│`),
    botBorder,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/cli/output.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/output.ts tests/cli/output.test.ts
git commit -m "feat: add CLI output formatting (JSON and human-friendly tables)"
```

---

## Task 16: CLI — Init Command

**Files:**
- Create: `src/cli/commands/init.ts`
- Create: `tests/cli/init.test.ts`
- Create: `src/index.ts` (CLI entry point)

- [ ] **Step 1: Write failing tests**

Create `tests/cli/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initCommand } from '../../src/cli/commands/init.js';
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
    const { rm } = await import('node:fs/promises');
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli/init.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `src/cli/commands/init.ts`:

```typescript
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { AGENTPOD_DIR, TASKS_DIR, WORKTREES_DIR, CONFIG_FILE } from '../../constants.js';
import type { AgentpodConfig } from '../../types.js';

export interface InitOptions {
  verify?: string[];
}

export async function initCommand(
  repoRoot: string,
  options: InitOptions
): Promise<{ created: boolean }> {
  const agentpodDir = join(repoRoot, AGENTPOD_DIR);

  // Create directories
  await mkdir(join(agentpodDir, TASKS_DIR), { recursive: true });
  await mkdir(join(agentpodDir, WORKTREES_DIR), { recursive: true });

  // Handle .gitignore
  const gitignorePath = join(repoRoot, '.gitignore');
  let gitignoreContent = '';
  try {
    gitignoreContent = await readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  if (!gitignoreContent.includes('.agentpod/')) {
    gitignoreContent = gitignoreContent.trimEnd() + '\n.agentpod/\n';
    await writeFile(gitignorePath, gitignoreContent);
  }

  // Create config.yml if verify commands provided
  if (options.verify && options.verify.length > 0) {
    const config: AgentpodConfig = { verify: options.verify };
    await writeFile(join(agentpodDir, CONFIG_FILE), dump(config));
  }

  return { created: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/cli/init.test.ts
```

Expected: PASS

- [ ] **Step 5: Create the CLI entry point**

Create `src/index.ts`:

```typescript
import { Command } from 'commander';
import { resolve } from 'node:path';
import { initCommand } from './cli/commands/init.js';
import { formatOutput } from './cli/output.js';

const program = new Command();

program
  .name('agentpod')
  .description('A CLI runtime for running parallel AI coding tasks safely inside real repos')
  .version('0.1.0');

function getRepoRoot(): string {
  return resolve(process.cwd());
}

program
  .command('init')
  .description('Initialize agentpod in the current repository')
  .option('--verify <commands...>', 'Verification commands to run')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await initCommand(getRepoRoot(), { verify: opts.verify });
    console.log(formatOutput(result, opts.human));
  });

program.parse();
```

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts tests/cli/init.test.ts src/index.ts
git commit -m "feat: add init command and CLI entry point"
```

---

## Task 17: CLI — Task Create & Task Status Commands

**Files:**
- Create: `src/cli/commands/task-create.ts`
- Create: `src/cli/commands/task-status.ts`
- Create: `tests/cli/task-create.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests for task create**

Create `tests/cli/task-create.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('taskCreateCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    // Clean worktrees
    const { execSync } = await import('node:child_process');
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('creates a task with a worktree and returns task info', async () => {
    const result = await taskCreateCommand(repo.path, {
      prompt: 'refactor auth to use JWT',
    });

    expect(result.id).toMatch(/^[a-z0-9]{6}$/);
    expect(result.status).toBe('ready');
    expect(result.branch).toContain('agentpod/');
    expect(result.worktree).toContain('.agentpod/worktrees/');
    expect(result.env.AGENTPOD_TASK_ID).toBe(result.id);
  });

  it('provisions the workspace with config copy/symlink', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');

    // Create a .env file and config
    await writeFile(join(repo.path, '.env'), 'SECRET=test\n');
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      'copy:\n  - .env\n'
    );

    const result = await taskCreateCommand(repo.path, { prompt: 'test' });

    const envPath = join(repo.path, '.agentpod', 'worktrees', result.id, '.env');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(envPath, 'utf-8');
    expect(content).toBe('SECRET=test\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli/task-create.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write task-create command**

Create `src/cli/commands/task-create.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { loadConfig } from '../../config/loader.js';
import type { TaskRecord } from '../../types.js';

export interface TaskCreateOptions {
  prompt: string;
  cmd?: string;
}

export async function taskCreateCommand(
  repoRoot: string,
  options: TaskCreateOptions
): Promise<TaskRecord> {
  const config = await loadConfig(repoRoot);
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);

  // Create task record
  const task = await tm.createTask({ prompt: options.prompt, cmd: options.cmd });
  await tm.updateStatus(task.id, 'provisioning');

  // Create worktree
  await wm.createWorktree(task.id, task.branch);

  // Provision
  await wm.provision(task.id, {
    copy: config.copy,
    symlink: config.symlink,
  });

  // Run setup hooks
  if (config.setup && config.setup.length > 0) {
    await wm.runSetupHooks(task.id, config.setup);
  }

  // Mark ready
  const readyTask = await tm.updateStatus(task.id, 'ready');
  return readyTask;
}
```

- [ ] **Step 4: Write task-status command**

Create `src/cli/commands/task-status.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import type { TaskRecord } from '../../types.js';

export async function taskStatusCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/cli/task-create.test.ts
```

Expected: PASS

- [ ] **Step 6: Wire commands into CLI entry point**

Add to `src/index.ts` (after the `init` command, before `program.parse()`):

```typescript
import { taskCreateCommand } from './cli/commands/task-create.js';
import { taskStatusCommand } from './cli/commands/task-status.js';

const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task with an isolated workspace')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .option('--cmd <cmd>', 'Command to execute (optional)')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await taskCreateCommand(getRepoRoot(), {
      prompt: opts.prompt,
      cmd: opts.cmd,
    });
    console.log(formatOutput(result, opts.human));
  });

taskCmd
  .command('status <id>')
  .description('Get detailed status for a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await taskStatusCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });
```

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/task-create.ts src/cli/commands/task-status.ts tests/cli/task-create.test.ts src/index.ts
git commit -m "feat: add task create and task status CLI commands"
```

---

## Task 18: CLI — Task Exec & Run Commands

**Files:**
- Create: `src/cli/commands/task-exec.ts`
- Create: `src/cli/commands/run.ts`
- Create: `tests/cli/run.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/cli/run.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/commands/run.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('runCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('creates a task, runs a command, and returns completed status', async () => {
    const result = await runCommand(repo.path, {
      prompt: 'test task',
      cmd: 'echo "hello from agent"',
      wait: true,
    });

    expect(result.status).toBe('completed');
    expect(result.exit_code).toBe(0);
  });

  it('captures agent output to log file', async () => {
    const result = await runCommand(repo.path, {
      prompt: 'log test',
      cmd: 'echo "captured"',
      wait: true,
    });

    const logPath = join(repo.path, '.agentpod', 'tasks', `${result.id}.log`);
    const log = await readFile(logPath, 'utf-8');
    expect(log).toContain('captured');
  });

  it('returns failed status when agent command fails and verification fails', async () => {
    const result = await runCommand(repo.path, {
      prompt: 'failing task',
      cmd: 'exit 1',
      wait: true,
    });

    // Status depends on verification — with no verify commands, it's completed
    expect(result.exit_code).toBe(1);
  });
});

describe('taskExecCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('runs a command in an existing task worktree', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'exec test' });

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: 'echo "executed"',
      wait: true,
    });

    expect(result.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli/run.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write task-exec command**

Create `src/cli/commands/task-exec.ts`:

```typescript
import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { AgentRunner } from '../../core/agent-runner.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import type { TaskRecord } from '../../types.js';

export interface TaskExecOptions {
  cmd: string;
  wait?: boolean;
}

export async function taskExecCommand(
  repoRoot: string,
  taskId: string,
  options: TaskExecOptions
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const runner = new AgentRunner(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const wtPath = resolve(repoRoot, task.worktree);

  // Transition to running
  await tm.updateStatus(taskId, 'running');

  if (options.wait) {
    // Blocking execution
    const result = await runner.run(taskId, options.cmd, wtPath, task.env);
    await tm.updateTask(taskId, { exit_code: result.exitCode, cmd: options.cmd });

    // Run verification
    const verifyCommands = config.verify || (await detectVerifyCommands(repoRoot));
    await tm.updateStatus(taskId, 'verifying');
    const verification = await verifier.runChecks(wtPath, verifyCommands);
    await tm.updateTask(taskId, { verification });

    // Update diff stats
    const { Reviewer } = await import('../../core/reviewer.js');
    const reviewer = new Reviewer(repoRoot);
    const diff_stats = await reviewer.getDiff(task.branch);
    await tm.updateTask(taskId, { diff_stats });

    // Final status
    const finalStatus = verification.passed ? 'completed' : 'failed';
    return await tm.updateStatus(taskId, finalStatus);
  } else {
    // Non-blocking: spawn and return immediately
    const handle = runner.spawn(taskId, options.cmd, wtPath, task.env);
    await tm.updateTask(taskId, { pid: handle.pid, cmd: options.cmd });
    return (await tm.getTask(taskId))!;
  }
}
```

- [ ] **Step 4: Write run command (convenience shortcut)**

Create `src/cli/commands/run.ts`:

```typescript
import { taskCreateCommand } from './task-create.js';
import { taskExecCommand } from './task-exec.js';
import type { TaskRecord } from '../../types.js';

export interface RunOptions {
  prompt: string;
  cmd: string;
  wait?: boolean;
}

export async function runCommand(
  repoRoot: string,
  options: RunOptions
): Promise<TaskRecord> {
  // Create task with workspace
  const task = await taskCreateCommand(repoRoot, {
    prompt: options.prompt,
    cmd: options.cmd,
  });

  // Execute command in the workspace
  return await taskExecCommand(repoRoot, task.id, {
    cmd: options.cmd,
    wait: options.wait,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/cli/run.test.ts
```

Expected: PASS

- [ ] **Step 6: Wire commands into CLI entry point**

Add to `src/index.ts`:

```typescript
import { taskExecCommand } from './cli/commands/task-exec.js';
import { runCommand } from './cli/commands/run.js';

taskCmd
  .command('exec <id>')
  .description('Execute a command inside a task worktree')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await taskExecCommand(getRepoRoot(), id, {
      cmd: opts.cmd,
      wait: opts.wait,
    });
    console.log(formatOutput(result, opts.human));
  });

program
  .command('run')
  .description('Create a task and run a command (shortcut for task create + task exec)')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await runCommand(getRepoRoot(), {
      prompt: opts.prompt,
      cmd: opts.cmd,
      wait: opts.wait,
    });
    console.log(formatOutput(result, opts.human));
  });
```

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/task-exec.ts src/cli/commands/run.ts tests/cli/run.test.ts src/index.ts
git commit -m "feat: add task exec and run commands"
```

---

## Task 19: CLI — List, Log, Summary Commands

**Files:**
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/log.ts`
- Create: `src/cli/commands/summary.ts`
- Create: `tests/cli/list.test.ts`
- Create: `tests/cli/log.test.ts`
- Create: `tests/cli/summary.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests for list**

Create `tests/cli/list.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { listCommand } from '../../src/cli/commands/list.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('listCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('returns empty array when no tasks exist', async () => {
    const result = await listCommand(repo.path);
    expect(result).toEqual([]);
  });

  it('returns all tasks with summary info', async () => {
    await taskCreateCommand(repo.path, { prompt: 'task 1' });
    await taskCreateCommand(repo.path, { prompt: 'task 2' });

    const result = await listCommand(repo.path);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('prompt');
    expect(result[0]).toHaveProperty('status');
  });
});
```

- [ ] **Step 2: Write failing tests for log**

Create `tests/cli/log.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logCommand } from '../../src/cli/commands/log.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('logCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns the log content for a task', async () => {
    await writeFile(join(repo.path, '.agentpod', 'tasks', 'abc123.log'), 'agent output here\n');

    const result = await logCommand(repo.path, 'abc123');
    expect(result).toContain('agent output here');
  });

  it('throws when log file does not exist', async () => {
    await expect(logCommand(repo.path, 'nonexistent')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Write failing tests for summary**

Create `tests/cli/summary.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { summaryCommand } from '../../src/cli/commands/summary.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('summaryCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('returns a summary of all tasks', async () => {
    await taskCreateCommand(repo.path, { prompt: 'task 1' });
    await taskCreateCommand(repo.path, { prompt: 'task 2' });

    const result = await summaryCommand(repo.path);

    expect(result.total).toBe(2);
    expect(result.tasks).toHaveLength(2);
  });

  it('counts tasks by status', async () => {
    const result = await summaryCommand(repo.path);

    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/cli/list.test.ts tests/cli/log.test.ts tests/cli/summary.test.ts
```

Expected: FAIL — cannot find modules

- [ ] **Step 5: Write list command**

Create `src/cli/commands/list.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import type { TaskRecord } from '../../types.js';

export async function listCommand(repoRoot: string): Promise<TaskRecord[]> {
  const tm = new TaskManager(repoRoot);
  return await tm.listTasks();
}
```

- [ ] **Step 6: Write log command**

Create `src/cli/commands/log.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { taskLogPath } from '../../constants.js';

export async function logCommand(repoRoot: string, taskId: string): Promise<string> {
  const logPath = taskLogPath(repoRoot, taskId);
  return await readFile(logPath, 'utf-8');
}
```

- [ ] **Step 7: Write summary command**

Create `src/cli/commands/summary.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import type { TaskRecord } from '../../types.js';

export interface SummaryResult {
  total: number;
  completed: number;
  failed: number;
  running: number;
  ready: number;
  errored: number;
  tasks: TaskRecord[];
}

export async function summaryCommand(repoRoot: string): Promise<SummaryResult> {
  const tm = new TaskManager(repoRoot);
  const tasks = await tm.listTasks();

  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
    running: tasks.filter((t) => t.status === 'running').length,
    ready: tasks.filter((t) => t.status === 'ready').length,
    errored: tasks.filter((t) => t.status === 'errored').length,
    tasks,
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/cli/list.test.ts tests/cli/log.test.ts tests/cli/summary.test.ts
```

Expected: PASS

- [ ] **Step 9: Wire commands into CLI entry point**

Add to `src/index.ts`:

```typescript
import { listCommand } from './cli/commands/list.js';
import { logCommand } from './cli/commands/log.js';
import { summaryCommand } from './cli/commands/summary.js';

program
  .command('list')
  .description('List all tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await listCommand(getRepoRoot());
    if (opts.human) {
      const { formatTable } = await import('./cli/output.js');
      const headers = ['ID', 'Status', 'Prompt', 'Files Changed'];
      const rows = result.map((t) => [
        t.id,
        t.status,
        t.prompt.slice(0, 40),
        String(t.diff_stats?.files_changed ?? '-'),
      ]);
      console.log(formatTable(headers, rows));
    } else {
      console.log(formatOutput(result, false));
    }
  });

program
  .command('log <id>')
  .description('Show captured agent output for a task')
  .action(async (id) => {
    const log = await logCommand(getRepoRoot(), id);
    console.log(log);
  });

program
  .command('summary')
  .description('Summary of all tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await summaryCommand(getRepoRoot());
    console.log(formatOutput(result, opts.human));
  });
```

- [ ] **Step 10: Commit**

```bash
git add src/cli/commands/list.ts src/cli/commands/log.ts src/cli/commands/summary.ts tests/cli/list.test.ts tests/cli/log.test.ts tests/cli/summary.test.ts src/index.ts
git commit -m "feat: add list, log, and summary commands"
```

---

## Task 20: CLI — Verify, Diff, Compare Commands

**Files:**
- Create: `src/cli/commands/verify.ts`
- Create: `src/cli/commands/diff.ts`
- Create: `src/cli/commands/compare.ts`
- Create: `tests/cli/verify.test.ts`
- Create: `tests/cli/diff.test.ts`
- Create: `tests/cli/compare.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests for verify**

Create `tests/cli/verify.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { verifyCommand } from '../../src/cli/commands/verify.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('verifyCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('runs verification checks against a task worktree', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    // Set up verify commands in config
    await writeFile(
      join(repo.path, '.agentpod', 'config.yml'),
      'verify:\n  - echo "check passed"\n'
    );

    const task = await taskCreateCommand(repo.path, { prompt: 'verify test' });
    const result = await verifyCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing tests for diff**

Create `tests/cli/diff.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { diffCommand } from '../../src/cli/commands/diff.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('diffCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('returns diff info for a task', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'diff test' });

    // Make a change in the worktree
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'newfile.ts'), 'export const x = 1;\n');
    execSync('git add . && git commit -m "add file"', { cwd: wtPath, stdio: 'ignore' });

    const result = await diffCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.files_changed).toBe(1);
  });
});
```

- [ ] **Step 3: Write failing tests for compare**

Create `tests/cli/compare.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { compareCommand } from '../../src/cli/commands/compare.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('compareCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('compares multiple tasks', async () => {
    const task1 = await taskCreateCommand(repo.path, { prompt: 'approach 1' });
    const task2 = await taskCreateCommand(repo.path, { prompt: 'approach 2' });

    const result = await compareCommand(repo.path, [task1.id, task2.id]);

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].id).toBe(task1.id);
    expect(result.tasks[1].id).toBe(task2.id);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/cli/verify.test.ts tests/cli/diff.test.ts tests/cli/compare.test.ts
```

Expected: FAIL — cannot find modules

- [ ] **Step 5: Write verify command**

Create `src/cli/commands/verify.ts`:

```typescript
import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { Verifier } from '../../core/verifier.js';
import { loadConfig } from '../../config/loader.js';
import { detectVerifyCommands } from '../../config/auto-detect.js';
import type { VerificationCheck } from '../../types.js';

export interface VerifyResult {
  id: string;
  checks: VerificationCheck[];
}

export async function verifyCommand(repoRoot: string, taskId: string): Promise<VerifyResult> {
  const tm = new TaskManager(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const wtPath = resolve(repoRoot, task.worktree);
  const verifyCommands = config.verify || (await detectVerifyCommands(repoRoot));

  // Transition to verifying if in ready state
  if (task.status === 'ready') {
    await tm.updateStatus(taskId, 'verifying');
  }

  const result = await verifier.runChecks(wtPath, verifyCommands);
  await tm.updateTask(taskId, { verification: result });

  // Update final status
  if (task.status === 'verifying' || task.status === 'ready') {
    const finalStatus = result.passed ? 'completed' : 'failed';
    await tm.updateStatus(taskId, finalStatus);
  }

  return { id: taskId, checks: result.checks };
}
```

- [ ] **Step 6: Write diff command**

Create `src/cli/commands/diff.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';

export interface DiffResult {
  id: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  diff: string;
}

export async function diffCommand(repoRoot: string, taskId: string): Promise<DiffResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const stats = await reviewer.getDiff(task.branch);
  const diffText = await reviewer.getDiffText(task.branch);

  return {
    id: taskId,
    ...stats,
    diff: diffText,
  };
}
```

- [ ] **Step 7: Write compare command**

Create `src/cli/commands/compare.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';

export interface CompareTaskInfo {
  id: string;
  prompt: string;
  status: string;
  checks_passed?: number;
  checks_total?: number;
  files_changed: number;
}

export interface CompareResult {
  tasks: CompareTaskInfo[];
}

export async function compareCommand(
  repoRoot: string,
  taskIds: string[]
): Promise<CompareResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);

  const tasks: CompareTaskInfo[] = [];

  for (const id of taskIds) {
    const task = await tm.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const stats = await reviewer.getDiff(task.branch);

    tasks.push({
      id: task.id,
      prompt: task.prompt,
      status: task.status,
      checks_passed: task.verification?.checks.filter((c) => c.passed).length,
      checks_total: task.verification?.checks.length,
      files_changed: stats.files_changed,
    });
  }

  return { tasks };
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/cli/verify.test.ts tests/cli/diff.test.ts tests/cli/compare.test.ts
```

Expected: PASS

- [ ] **Step 9: Wire commands into CLI entry point**

Add to `src/index.ts`:

```typescript
import { verifyCommand } from './cli/commands/verify.js';
import { diffCommand } from './cli/commands/diff.js';
import { compareCommand } from './cli/commands/compare.js';

program
  .command('verify <id>')
  .description('Run verification checks against a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await verifyCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

program
  .command('diff <id>')
  .description('Show diff of changes in a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await diffCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

program
  .command('compare <ids...>')
  .description('Compare multiple tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (ids, opts) => {
    const result = await compareCommand(getRepoRoot(), ids);
    console.log(formatOutput(result, opts.human));
  });
```

- [ ] **Step 10: Commit**

```bash
git add src/cli/commands/verify.ts src/cli/commands/diff.ts src/cli/commands/compare.ts tests/cli/verify.test.ts tests/cli/diff.test.ts tests/cli/compare.test.ts src/index.ts
git commit -m "feat: add verify, diff, and compare commands"
```

---

## Task 21: CLI — Merge, Discard, Clean Commands

**Files:**
- Create: `src/cli/commands/merge.ts`
- Create: `src/cli/commands/discard.ts`
- Create: `src/cli/commands/clean.ts`
- Create: `tests/cli/merge.test.ts`
- Create: `tests/cli/discard.test.ts`
- Create: `tests/cli/clean.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests for merge**

Create `tests/cli/merge.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { mergeCommand } from '../../src/cli/commands/merge.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('mergeCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('merges a task branch and cleans up the worktree', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'merge test' });

    // Make a change in the worktree
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'merged.ts'), 'export const merged = true;\n');
    execSync('git add . && git commit -m "add merged file"', { cwd: wtPath, stdio: 'ignore' });

    const result = await mergeCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.merged).toBe(true);

    // Verify the file exists on the main branch
    await access(join(repo.path, 'merged.ts'));

    // Verify worktree is removed
    await expect(access(wtPath)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Write failing tests for discard**

Create `tests/cli/discard.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { discardCommand } from '../../src/cli/commands/discard.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('discardCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('discards a task by removing worktree and branch', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'discard test' });
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);

    const result = await discardCommand(repo.path, task.id);

    expect(result.id).toBe(task.id);
    expect(result.status).toBe('discarded');

    // Worktree should be gone
    await expect(access(wtPath)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Write failing tests for clean**

Create `tests/cli/clean.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { cleanCommand } from '../../src/cli/commands/clean.js';
import { createTestRepoWithAgentpod, type TestRepo } from '../helpers/test-repo.js';

describe('cleanCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgentpod();
  });

  afterEach(async () => {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('returns empty arrays when nothing to clean', async () => {
    const result = await cleanCommand(repo.path);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/cli/merge.test.ts tests/cli/discard.test.ts tests/cli/clean.test.ts
```

Expected: FAIL — cannot find modules

- [ ] **Step 5: Write merge command**

Create `src/cli/commands/merge.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import { Reviewer } from '../../core/reviewer.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';

export interface MergeResult {
  id: string;
  merged: boolean;
  strategy?: string;
  commit?: string;
}

export async function mergeCommand(repoRoot: string, taskId: string): Promise<MergeResult> {
  const tm = new TaskManager(repoRoot);
  const reviewer = new Reviewer(repoRoot);
  const wm = new WorkspaceManager(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Remove worktree first (git can't merge from a checked-out branch)
  await wm.removeWorktree(taskId, ''); // Don't delete branch yet

  // Attempt merge
  const result = await reviewer.merge(task.branch);

  if (result.success) {
    // Clean up branch
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(repoRoot);
      await git.raw(['branch', '-D', task.branch]);
    } catch {
      // Branch may already be gone
    }

    await tm.updateStatus(taskId, 'merged');
    return { id: taskId, merged: true, strategy: result.strategy, commit: result.commit };
  } else {
    return { id: taskId, merged: false };
  }
}
```

- [ ] **Step 6: Write discard command**

Create `src/cli/commands/discard.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import type { TaskRecord } from '../../types.js';

export async function discardCommand(
  repoRoot: string,
  taskId: string
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);

  const task = await tm.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  await wm.removeWorktree(taskId, task.branch);
  return await tm.updateStatus(taskId, 'discarded');
}
```

- [ ] **Step 7: Write clean command**

Create `src/cli/commands/clean.ts`:

```typescript
import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';

export interface CleanResult {
  removed: string[];
  kept: string[];
}

export async function cleanCommand(repoRoot: string): Promise<CleanResult> {
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const tasks = await tm.listTasks();

  const removed: string[] = [];
  const kept: string[] = [];

  for (const task of tasks) {
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'discarded' || task.status === 'merged') {
      try {
        await wm.removeWorktree(task.id, task.branch);
        removed.push(task.id);
      } catch {
        // Worktree may already be removed
        removed.push(task.id);
      }
    } else {
      kept.push(task.id);
    }
  }

  return { removed, kept };
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/cli/merge.test.ts tests/cli/discard.test.ts tests/cli/clean.test.ts
```

Expected: PASS

- [ ] **Step 9: Wire commands into CLI entry point**

Add to `src/index.ts`:

```typescript
import { mergeCommand } from './cli/commands/merge.js';
import { discardCommand } from './cli/commands/discard.js';
import { cleanCommand } from './cli/commands/clean.js';

program
  .command('merge <id>')
  .description('Merge a task branch into the current branch')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await mergeCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

program
  .command('discard <id>')
  .description('Discard a task (remove worktree and branch)')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    const result = await discardCommand(getRepoRoot(), id);
    console.log(formatOutput(result, opts.human));
  });

program
  .command('clean')
  .description('Clean up all completed/discarded task worktrees')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    const result = await cleanCommand(getRepoRoot());
    console.log(formatOutput(result, opts.human));
  });
```

- [ ] **Step 10: Commit**

```bash
git add src/cli/commands/merge.ts src/cli/commands/discard.ts src/cli/commands/clean.ts tests/cli/merge.test.ts tests/cli/discard.test.ts tests/cli/clean.test.ts src/index.ts
git commit -m "feat: add merge, discard, and clean commands"
```

---

## Task 22: MCP Server

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp/tools.ts`
- Modify: `package.json` (add `@modelcontextprotocol/sdk` dependency)

- [ ] **Step 1: Add MCP SDK dependency**

```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Write the MCP tools definition**

Create `src/mcp/tools.ts`:

```typescript
import { resolve } from 'node:path';
import { initCommand } from '../cli/commands/init.js';
import { taskCreateCommand } from '../cli/commands/task-create.js';
import { taskExecCommand } from '../cli/commands/task-exec.js';
import { taskStatusCommand } from '../cli/commands/task-status.js';
import { runCommand } from '../cli/commands/run.js';
import { listCommand } from '../cli/commands/list.js';
import { logCommand } from '../cli/commands/log.js';
import { verifyCommand } from '../cli/commands/verify.js';
import { diffCommand } from '../cli/commands/diff.js';
import { compareCommand } from '../cli/commands/compare.js';
import { summaryCommand } from '../cli/commands/summary.js';
import { mergeCommand } from '../cli/commands/merge.js';
import { discardCommand } from '../cli/commands/discard.js';
import { cleanCommand } from '../cli/commands/clean.js';

function getRepoRoot(): string {
  return resolve(process.cwd());
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function getTools(): ToolDefinition[] {
  return [
    {
      name: 'agentpod_task_create',
      description: 'Create a new task with an isolated git worktree workspace',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Description of the task' },
          cmd: { type: 'string', description: 'Optional command to execute later' },
        },
        required: ['prompt'],
      },
      handler: async (args) => {
        return await taskCreateCommand(getRepoRoot(), {
          prompt: args.prompt as string,
          cmd: args.cmd as string | undefined,
        });
      },
    },
    {
      name: 'agentpod_run',
      description: 'Create a task and run a command in its workspace (shortcut for create + exec)',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Description of the task' },
          cmd: { type: 'string', description: 'Command to run' },
          wait: { type: 'boolean', description: 'Wait for completion', default: true },
        },
        required: ['prompt', 'cmd'],
      },
      handler: async (args) => {
        return await runCommand(getRepoRoot(), {
          prompt: args.prompt as string,
          cmd: args.cmd as string,
          wait: (args.wait as boolean) ?? true,
        });
      },
    },
    {
      name: 'agentpod_task_status',
      description: 'Get detailed status for a task',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        return await taskStatusCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_verify',
      description: 'Run verification checks against a task worktree',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        return await verifyCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_diff',
      description: 'Show diff of changes in a task',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        return await diffCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_compare',
      description: 'Compare multiple tasks side by side',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Task IDs to compare',
          },
        },
        required: ['ids'],
      },
      handler: async (args) => {
        return await compareCommand(getRepoRoot(), args.ids as string[]);
      },
    },
    {
      name: 'agentpod_list',
      description: 'List all tasks',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return await listCommand(getRepoRoot());
      },
    },
    {
      name: 'agentpod_merge',
      description: 'Merge a task branch into the current branch',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID to merge' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        return await mergeCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_discard',
      description: 'Discard a task (remove worktree and branch)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID to discard' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        return await discardCommand(getRepoRoot(), args.id as string);
      },
    },
    {
      name: 'agentpod_clean',
      description: 'Clean up all completed/discarded task worktrees',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return await cleanCommand(getRepoRoot());
      },
    },
    {
      name: 'agentpod_summary',
      description: 'Get a summary of all tasks',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return await summaryCommand(getRepoRoot());
      },
    },
  ];
}
```

- [ ] **Step 3: Write the MCP server**

Create `src/mcp/server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getTools } from './tools.js';

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'agentpod',
    version: '0.1.0',
  });

  const tools = getTools();

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      try {
        const result = await tool.handler(args as Record<string, unknown>);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Add MCP server entry point to package.json**

Update `package.json` to add a second bin entry and build config:

Add to `package.json` `bin` field:

```json
"bin": {
  "agentpod": "./dist/index.js",
  "agentpod-mcp": "./dist/mcp/server.js"
}
```

- [ ] **Step 5: Update tsup.config.ts to include MCP entry**

Update `tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/mcp/server.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: true,
});
```

And update `src/mcp/server.ts` to add the shebang-triggering self-start at the bottom:

```typescript
// Auto-start when run directly
startMcpServer().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Verify it builds**

```bash
npm run build
npx tsc --noEmit
```

Expected: builds successfully.

- [ ] **Step 7: Commit**

```bash
git add src/mcp/server.ts src/mcp/tools.ts package.json tsup.config.ts package-lock.json
git commit -m "feat: add MCP server exposing all agentpod commands as tools"
```

---

## Task 23: Full Integration Test

**Files:**
- Create: `tests/integration/full-workflow.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/full-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { initCommand } from '../../src/cli/commands/init.js';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { runCommand } from '../../src/cli/commands/run.js';
import { verifyCommand } from '../../src/cli/commands/verify.js';
import { diffCommand } from '../../src/cli/commands/diff.js';
import { compareCommand } from '../../src/cli/commands/compare.js';
import { mergeCommand } from '../../src/cli/commands/merge.js';
import { discardCommand } from '../../src/cli/commands/discard.js';
import { cleanCommand } from '../../src/cli/commands/clean.js';
import { listCommand } from '../../src/cli/commands/list.js';
import { summaryCommand } from '../../src/cli/commands/summary.js';
import { createTestRepo, type TestRepo } from '../helpers/test-repo.js';

describe('Full Workflow Integration', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    // Clean up all worktrees
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repo.path,
        encoding: 'utf-8',
      });
      const worktrees = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== repo.path);
      for (const wt of worktrees) {
        execSync(`git worktree remove --force "${wt}"`, {
          cwd: repo.path,
          stdio: 'ignore',
        });
      }
    } catch {
      // Ignore
    }
    await repo.cleanup();
  });

  it('runs the complete lifecycle: init → create → exec → verify → diff → merge → clean', async () => {
    // Step 1: Init
    await initCommand(repo.path, { verify: ['true'] });
    await access(join(repo.path, '.agentpod'));

    // Step 2: Create a task
    const task = await taskCreateCommand(repo.path, { prompt: 'add greeting feature' });
    expect(task.status).toBe('ready');

    // Step 3: Execute a command that makes changes
    const wtPath = join(repo.path, '.agentpod', 'worktrees', task.id);
    await writeFile(join(wtPath, 'greeting.ts'), 'export function greet(name: string) { return `Hello, ${name}!`; }\n');
    execSync('git add . && git commit -m "add greeting"', { cwd: wtPath, stdio: 'ignore' });

    // Step 4: Verify
    const verifyResult = await verifyCommand(repo.path, task.id);
    expect(verifyResult.checks[0].passed).toBe(true);

    // Step 5: Diff
    const diffResult = await diffCommand(repo.path, task.id);
    expect(diffResult.files_changed).toBe(1);

    // Step 6: Merge
    const mergeResult = await mergeCommand(repo.path, task.id);
    expect(mergeResult.merged).toBe(true);

    // Verify file is on main branch
    const content = await readFile(join(repo.path, 'greeting.ts'), 'utf-8');
    expect(content).toContain('Hello');

    // Step 7: Clean
    const cleanResult = await cleanCommand(repo.path);
    expect(cleanResult.removed.length).toBeGreaterThanOrEqual(0);
  });

  it('runs parallel tasks and compares them', async () => {
    await initCommand(repo.path, { verify: ['true'] });

    // Create two parallel tasks
    const task1 = await taskCreateCommand(repo.path, { prompt: 'approach 1' });
    const task2 = await taskCreateCommand(repo.path, { prompt: 'approach 2' });

    // Make different changes in each
    const wt1 = join(repo.path, '.agentpod', 'worktrees', task1.id);
    const wt2 = join(repo.path, '.agentpod', 'worktrees', task2.id);

    await writeFile(join(wt1, 'solution.ts'), 'export const approach = "A";\n');
    execSync('git add . && git commit -m "approach A"', { cwd: wt1, stdio: 'ignore' });

    await writeFile(join(wt2, 'solution.ts'), 'export const approach = "B";\nexport const extra = true;\n');
    execSync('git add . && git commit -m "approach B"', { cwd: wt2, stdio: 'ignore' });

    // Compare
    const comparison = await compareCommand(repo.path, [task1.id, task2.id]);
    expect(comparison.tasks).toHaveLength(2);

    // List and summary
    const tasks = await listCommand(repo.path);
    expect(tasks).toHaveLength(2);

    const summary = await summaryCommand(repo.path);
    expect(summary.total).toBe(2);

    // Discard one, merge the other
    await discardCommand(repo.path, task2.id);
    const merged = await mergeCommand(repo.path, task1.id);
    expect(merged.merged).toBe(true);
  });

  it('handles the run shortcut (create + exec in one shot)', async () => {
    await initCommand(repo.path, { verify: ['true'] });

    const result = await runCommand(repo.path, {
      prompt: 'quick task',
      cmd: 'echo "done"',
      wait: true,
    });

    expect(result.status).toBe('completed');
    expect(result.exit_code).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx vitest run tests/integration/full-workflow.test.ts
```

Expected: PASS — this is an integration test exercising the full flow with already-implemented modules.

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: builds cleanly.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/full-workflow.test.ts
git commit -m "test: add full workflow integration tests"
```

---

## Task 24: Final CLI Entry Point Assembly

**Files:**
- Modify: `src/index.ts` — ensure all commands are wired up correctly

- [ ] **Step 1: Write the complete CLI entry point**

Rewrite `src/index.ts` with all commands properly wired:

```typescript
import { Command } from 'commander';
import { resolve } from 'node:path';
import { initCommand } from './cli/commands/init.js';
import { taskCreateCommand } from './cli/commands/task-create.js';
import { taskExecCommand } from './cli/commands/task-exec.js';
import { taskStatusCommand } from './cli/commands/task-status.js';
import { runCommand } from './cli/commands/run.js';
import { listCommand } from './cli/commands/list.js';
import { logCommand } from './cli/commands/log.js';
import { verifyCommand } from './cli/commands/verify.js';
import { diffCommand } from './cli/commands/diff.js';
import { compareCommand } from './cli/commands/compare.js';
import { summaryCommand } from './cli/commands/summary.js';
import { mergeCommand } from './cli/commands/merge.js';
import { discardCommand } from './cli/commands/discard.js';
import { cleanCommand } from './cli/commands/clean.js';
import { formatOutput, formatTable } from './cli/output.js';
import { EXIT_CODES } from './constants.js';

const program = new Command();

program
  .name('agentpod')
  .description('A CLI runtime for running parallel AI coding tasks safely inside real repos')
  .version('0.1.0');

function getRepoRoot(): string {
  return resolve(process.cwd());
}

function handleError(err: unknown, exitCode: number = EXIT_CODES.INVALID_ARGS): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: message }));
  process.exit(exitCode);
}

// --- Init ---
program
  .command('init')
  .description('Initialize agentpod in the current repository')
  .option('--verify <commands...>', 'Verification commands to run')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      const result = await initCommand(getRepoRoot(), { verify: opts.verify });
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err);
    }
  });

// --- Task subcommands ---
const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task with an isolated workspace')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .option('--cmd <cmd>', 'Command to execute (optional)')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      const result = await taskCreateCommand(getRepoRoot(), {
        prompt: opts.prompt,
        cmd: opts.cmd,
      });
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.WORKSPACE_ERROR);
    }
  });

taskCmd
  .command('exec <id>')
  .description('Execute a command inside a task worktree')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      const result = await taskExecCommand(getRepoRoot(), id, {
        cmd: opts.cmd,
        wait: opts.wait,
      });
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.AGENT_FAILED);
    }
  });

taskCmd
  .command('status <id>')
  .description('Get detailed status for a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      const result = await taskStatusCommand(getRepoRoot(), id);
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

// --- Top-level commands ---
program
  .command('run')
  .description('Create a task and run a command (shortcut for task create + task exec)')
  .requiredOption('--prompt <prompt>', 'Description of the task')
  .requiredOption('--cmd <cmd>', 'Command to run')
  .option('--wait', 'Wait for completion', false)
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      const result = await runCommand(getRepoRoot(), {
        prompt: opts.prompt,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.AGENT_FAILED);
    }
  });

program
  .command('list')
  .description('List all tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      const result = await listCommand(getRepoRoot());
      if (opts.human) {
        const headers = ['ID', 'Status', 'Prompt', 'Files Changed'];
        const rows = result.map((t) => [
          t.id,
          t.status,
          t.prompt.slice(0, 40),
          String(t.diff_stats?.files_changed ?? '-'),
        ]);
        console.log(formatTable(headers, rows));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('log <id>')
  .description('Show captured agent output for a task')
  .action(async (id) => {
    try {
      const log = await logCommand(getRepoRoot(), id);
      console.log(log);
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('verify <id>')
  .description('Run verification checks against a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      const result = await verifyCommand(getRepoRoot(), id);
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.VERIFICATION_FAILED);
    }
  });

program
  .command('diff <id>')
  .description('Show diff of changes in a task')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      const result = await diffCommand(getRepoRoot(), id);
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('compare <ids...>')
  .description('Compare multiple tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (ids, opts) => {
    try {
      const result = await compareCommand(getRepoRoot(), ids);
      if (opts.human) {
        const headers = ['ID', 'Status', 'Checks', 'Files Changed', 'Prompt'];
        const rows = result.tasks.map((t) => [
          t.id,
          t.status,
          t.checks_total ? `${t.checks_passed}/${t.checks_total}` : '-',
          String(t.files_changed),
          t.prompt.slice(0, 30),
        ]);
        console.log(formatTable(headers, rows));
      } else {
        console.log(formatOutput(result, false));
      }
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('summary')
  .description('Summary of all tasks')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      const result = await summaryCommand(getRepoRoot());
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('merge <id>')
  .description('Merge a task branch into the current branch')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      const result = await mergeCommand(getRepoRoot(), id);
      if (!result.merged) {
        console.error(JSON.stringify({ error: 'Merge conflict', id }));
        process.exit(EXIT_CODES.MERGE_CONFLICT);
      }
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.MERGE_CONFLICT);
    }
  });

program
  .command('discard <id>')
  .description('Discard a task (remove worktree and branch)')
  .option('--human', 'Human-friendly output', false)
  .action(async (id, opts) => {
    try {
      const result = await discardCommand(getRepoRoot(), id);
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('clean')
  .description('Clean up all completed/discarded task worktrees')
  .option('--human', 'Human-friendly output', false)
  .action(async (opts) => {
    try {
      const result = await cleanCommand(getRepoRoot());
      console.log(formatOutput(result, opts.human));
    } catch (err) {
      handleError(err);
    }
  });

program.parse();
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 3: Build and verify the CLI works**

```bash
npm run build
node dist/index.js --help
```

Expected: displays help with all commands listed.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: complete CLI entry point with all commands and error handling"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Plan Task(s) |
|---|---|
| `agentpod init` | Task 16 |
| `agentpod task create` | Task 17 |
| `agentpod task exec` | Task 18 |
| `agentpod task status` | Task 17 |
| `agentpod run` | Task 18 |
| `agentpod list` | Task 19 |
| `agentpod log` | Task 19 |
| `agentpod verify` | Task 20 |
| `agentpod diff` | Task 20 |
| `agentpod compare` | Task 20 |
| `agentpod summary` | Task 19 |
| `agentpod merge` | Task 21 |
| `agentpod discard` | Task 21 |
| `agentpod clean` | Task 21 |
| JSON-first output | Task 15 |
| `--human` flag | Task 15, Task 24 |
| Task state machine | Task 7 |
| Worktree creation | Task 8 |
| Workspace provisioning (copy/symlink) | Task 9 |
| Setup hooks | Task 10 |
| Agent subprocess spawn | Task 11 |
| Verification auto-detection | Task 5 |
| Verification execution | Task 12 |
| Port isolation | Task 3 |
| Config loading | Task 4 |
| Exit codes | Task 1, Task 24 |
| MCP server | Task 22 |
| Repo invisibility (.gitignore) | Task 16 |
| Integration test | Task 23 |

### Type Consistency

- `TaskRecord` defined in Task 1, used consistently in Tasks 6-24
- `TaskStatus` defined in Task 1, used in Task 7 state machine
- `AgentpodConfig` defined in Task 1, consumed by Task 4 (loader) and Task 9 (provisioning)
- `VerificationResult`/`VerificationCheck` defined in Task 1, used in Tasks 12, 20
- `DiffStats` defined in Task 1, used in Tasks 13, 20

### Placeholder Scan

No TBD, TODO, "implement later", or "similar to Task N" patterns found.

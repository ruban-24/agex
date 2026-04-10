# v0.2.0 Agent Autonomy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship structured verify output (#10), retry with feedback (#12), and needs-input state (#27) to complete the single-task agent lifecycle.

**Architecture:** Three features layered on the existing state machine and verifier. Parsers are pure functions registered by name. Retry creates a new task branching from the failed task. Needs-input detects a file in the worktree after agent exit. All features are additive — no breaking changes to existing behavior.

**Tech Stack:** TypeScript, vitest, commander, execa, simple-git, js-yaml

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `ParsedError`, `NeedsInputPayload`, `QAPair`, `VerifyCommand`, new `TaskStatus` values, new `TaskRecord` fields |
| `src/core/task-manager.ts` | Modify | Add `needs-input` and `retried` to state machine transitions |
| `src/core/verifier.ts` | Modify | Accept `VerifyCommand[]`, apply parsers to output |
| `src/core/parsers/index.ts` | Create | Parser registry: `getParser(name)` lookup |
| `src/core/parsers/jest.ts` | Create | Jest/vitest output parser |
| `src/core/parsers/typescript.ts` | Create | TypeScript compiler output parser |
| `src/core/parsers/eslint.ts` | Create | ESLint output parser |
| `src/core/parsers/pytest.ts` | Create | Pytest output parser |
| `src/cli/commands/retry.ts` | Create | `agex retry` command: prompt construction, task creation, execution |
| `src/cli/commands/respond.ts` | Create | `agex respond` command: Q&A append, re-execute agent |
| `src/cli/commands/task-exec.ts` | Modify | Needs-input detection in completion handler |
| `src/cli/commands/verify.ts` | Modify | Pass `VerifyCommand[]` to verifier |
| `src/config/loader.ts` | Modify | Normalize `VerifyCommand[]` from config |
| `src/index.ts` | Modify | Wire `retry` and `respond` commands |
| `src/mcp/tools.ts` | Modify | Add `agex_retry` and `agex_respond` tools |
| `src/cli/format/human.ts` | Modify | Format parsed errors, needs-input, retry lineage |
| `src/cli/format/symbols.ts` | Modify | Add symbols for `needs-input` and `retried` |

---

### Task 1: Types and State Machine Foundation

**Files:**
- Modify: `src/types.ts:1-70`
- Modify: `src/core/task-manager.ts:87-98`
- Modify: `src/cli/format/symbols.ts:4-15`
- Test: `tests/core/task-manager.test.ts`

- [ ] **Step 1: Write failing tests for new state transitions**

Add to `tests/core/task-manager.test.ts`:

```typescript
describe('v0.2.0 state transitions', () => {
  it('transitions running to needs-input', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    const updated = await tm.updateStatus(task.id, 'needs-input');
    expect(updated.status).toBe('needs-input');
  });

  it('transitions needs-input to running', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'needs-input');
    const updated = await tm.updateStatus(task.id, 'running');
    expect(updated.status).toBe('running');
  });

  it('transitions needs-input to discarded', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'needs-input');
    const updated = await tm.updateStatus(task.id, 'discarded');
    expect(updated.status).toBe('discarded');
  });

  it('transitions failed to retried', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'verifying');
    await tm.updateStatus(task.id, 'failed');
    const updated = await tm.updateStatus(task.id, 'retried');
    expect(updated.status).toBe('retried');
  });

  it('transitions errored to retried', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'errored');
    const updated = await tm.updateStatus(task.id, 'retried');
    expect(updated.status).toBe('retried');
  });

  it('transitions completed to retried', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'verifying');
    await tm.updateStatus(task.id, 'completed');
    const updated = await tm.updateStatus(task.id, 'retried');
    expect(updated.status).toBe('retried');
  });

  it('rejects transition from completed to needs-input', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'verifying');
    await tm.updateStatus(task.id, 'completed');
    await expect(tm.updateStatus(task.id, 'needs-input')).rejects.toThrow(/invalid transition/i);
  });

  it('rejects transition from retried (terminal)', async () => {
    const task = await tm.createTask({ prompt: 'test' });
    await tm.updateStatus(task.id, 'provisioning');
    await tm.updateStatus(task.id, 'ready');
    await tm.updateStatus(task.id, 'running');
    await tm.updateStatus(task.id, 'verifying');
    await tm.updateStatus(task.id, 'failed');
    await tm.updateStatus(task.id, 'retried');
    await expect(tm.updateStatus(task.id, 'running')).rejects.toThrow(/invalid transition/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/task-manager.test.ts`
Expected: 8 new tests FAIL — `needs-input` and `retried` are not valid status values

- [ ] **Step 3: Add new types to `src/types.ts`**

Add `'needs-input'` and `'retried'` to the `TaskStatus` union. Add new interfaces and fields:

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
  | 'discarded'
  | 'needs-input'
  | 'retried';

export interface ParsedError {
  file?: string;
  line?: number;
  message: string;
  rule?: string;
  expected?: string;
  actual?: string;
}

export interface NeedsInputPayload {
  question: string;
  options?: string[];
  context?: string;
}

export interface QAPair {
  question: string;
  answer: string;
  round: number;
}

export type VerifyCommand = string | { cmd: string; parser?: string };

export interface VerificationCheck {
  cmd: string;
  passed: boolean;
  exit_code: number;
  duration_s: number;
  output?: string;
  parsed?: ParsedError[];
}

// Add to TaskRecord:
export interface TaskRecord {
  // ... all existing fields ...

  // Retry
  retriedFrom?: string;
  retryDepth?: number;
  retryFeedback?: string;
  retryFromScratch?: boolean;

  // Needs-input
  needsInput?: NeedsInputPayload;
  responses?: QAPair[];
}

// Update AgexConfig:
export interface AgexConfig {
  verify?: VerifyCommand[];
  copy?: string[];
  symlink?: string[];
  setup?: string[];
  run?: RunConfig;
}
```

- [ ] **Step 4: Update state machine in `src/core/task-manager.ts`**

Replace the `VALID_TRANSITIONS` object:

```typescript
private static VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['provisioning'],
  provisioning: ['ready', 'errored'],
  ready: ['running', 'verifying', 'merged', 'discarded'],
  running: ['verifying', 'needs-input', 'errored'],
  verifying: ['completed', 'failed'],
  completed: ['merged', 'discarded', 'retried'],
  failed: ['merged', 'discarded', 'retried'],
  errored: ['discarded', 'retried'],
  'needs-input': ['running', 'discarded'],
  merged: [],
  discarded: [],
  retried: [],
};
```

- [ ] **Step 5: Update symbols in `src/cli/format/symbols.ts`**

Add entries for new states to `SYMBOL_MAP`:

```typescript
'needs-input':  { symbol: '?', color: yellow },
retried:        { symbol: '↻', color: dim },
```

- [ ] **Step 6: Update sort priority in `src/cli/format/human.ts`**

Add entries to the `order` object in `taskSortPriority`:

```typescript
'needs-input': 0,  // needs attention, show first
retried: 5,        // terminal, show last with discarded
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/core/task-manager.test.ts`
Expected: All tests PASS including the 8 new ones

- [ ] **Step 8: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All existing tests still PASS. Some format tests may need updating if they hardcode status lists — fix any that break.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/core/task-manager.ts src/cli/format/symbols.ts src/cli/format/human.ts tests/core/task-manager.test.ts
git commit -m "feat: add needs-input and retried states to task state machine

Add ParsedError, NeedsInputPayload, QAPair, VerifyCommand types.
Extend TaskRecord with retry and needs-input fields.
Update state transitions, symbols, and sort priority."
```

---

### Task 2: Parser System — Registry and Jest Parser

**Files:**
- Create: `src/core/parsers/index.ts`
- Create: `src/core/parsers/jest.ts`
- Test: `tests/core/parsers/jest.test.ts`

- [ ] **Step 1: Create test fixture and write failing test**

Create `tests/core/parsers/jest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseJest } from '../../../src/core/parsers/jest.js';

const JEST_FAILURE_OUTPUT = `
PASS src/utils.test.ts
FAIL src/auth.test.ts
  ● login() › should return valid token

    expect(received).toEqual(expected)

    Expected: {"token": "abc123"}
    Received: undefined

      12 |   const result = login(user);
      13 |   expect(result).toEqual({ token: 'abc123' });
         |                  ^
      14 | });

  ● logout() › should clear session

    expect(received).toBe(expected)

    Expected: null
    Received: {"active": true}

      22 |   const result = logout();
      23 |   expect(result).toBe(null);
         |                  ^
      24 | });

FAIL src/config.test.ts
  ● loadConfig() › should parse yaml

    TypeError: Cannot read properties of undefined (reading 'split')

      5 | export function loadConfig(raw: string) {
      6 |   return raw.split('\\n');
        |              ^
      7 | }

Test Suites: 2 failed, 1 passed, 3 total
Tests:       3 failed, 5 passed, 8 total
`;

describe('parseJest', () => {
  it('extracts failing test name and file', () => {
    const errors = parseJest(JEST_FAILURE_OUTPUT);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors[0].file).toBe('src/auth.test.ts');
    expect(errors[0].message).toContain('login()');
    expect(errors[0].message).toContain('should return valid token');
  });

  it('extracts expected and actual values', () => {
    const errors = parseJest(JEST_FAILURE_OUTPUT);
    const loginError = errors.find((e) => e.message?.includes('login'));
    expect(loginError?.expected).toContain('"token"');
    expect(loginError?.actual).toBe('undefined');
  });

  it('extracts line number from code pointer', () => {
    const errors = parseJest(JEST_FAILURE_OUTPUT);
    expect(errors[0].line).toBe(13);
  });

  it('handles TypeError style errors without expected/actual', () => {
    const errors = parseJest(JEST_FAILURE_OUTPUT);
    const typeError = errors.find((e) => e.message?.includes('loadConfig'));
    expect(typeError).toBeDefined();
    expect(typeError?.file).toBe('src/config.test.ts');
  });

  it('returns empty array for passing output', () => {
    const output = 'Test Suites: 1 passed, 1 total\nTests: 5 passed, 5 total';
    expect(parseJest(output)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseJest('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/parsers/jest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement parser registry**

Create `src/core/parsers/index.ts`:

```typescript
import type { ParsedError } from '../../types.js';
import { parseJest } from './jest.js';

export type OutputParser = (raw: string) => ParsedError[];

const PARSERS: Record<string, OutputParser> = {
  jest: parseJest,
  vitest: parseJest, // same output format
};

export function getParser(name: string): OutputParser | undefined {
  return PARSERS[name];
}
```

- [ ] **Step 4: Implement jest parser**

Create `src/core/parsers/jest.ts`:

```typescript
import type { ParsedError } from '../../types.js';

export function parseJest(raw: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = raw.split('\n');

  let currentFile: string | undefined;
  let currentMessage: string | undefined;
  let expected: string | undefined;
  let actual: string | undefined;
  let lineNumber: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: FAIL src/auth.test.ts
    const failMatch = line.match(/^\s*FAIL\s+(.+)$/);
    if (failMatch) {
      currentFile = failMatch[1].trim();
      continue;
    }

    // Match: ● test name › sub name
    const testMatch = line.match(/^\s*●\s+(.+)$/);
    if (testMatch) {
      // Flush previous error if any
      if (currentMessage) {
        errors.push({
          file: currentFile,
          line: lineNumber,
          message: currentMessage,
          expected,
          actual,
        });
      }
      currentMessage = testMatch[1].trim();
      expected = undefined;
      actual = undefined;
      lineNumber = undefined;
      continue;
    }

    // Match: Expected: value
    const expectedMatch = line.match(/^\s*Expected:\s*(.+)$/);
    if (expectedMatch && currentMessage) {
      expected = expectedMatch[1].trim();
      continue;
    }

    // Match: Received: value
    const receivedMatch = line.match(/^\s*Received:\s*(.+)$/);
    if (receivedMatch && currentMessage) {
      actual = receivedMatch[1].trim();
      continue;
    }

    // Match line number from: "      13 |   code"  followed by "         |   ^"
    const pointerMatch = line.match(/^\s*\|?\s*\^/);
    if (pointerMatch && currentMessage && i > 0) {
      const prevLine = lines[i - 1];
      const numMatch = prevLine.match(/^\s*(\d+)\s*\|/);
      if (numMatch) {
        lineNumber = parseInt(numMatch[1], 10);
      }
      continue;
    }
  }

  // Flush last error
  if (currentMessage) {
    errors.push({
      file: currentFile,
      line: lineNumber,
      message: currentMessage,
      expected,
      actual,
    });
  }

  return errors;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/parsers/jest.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/parsers/index.ts src/core/parsers/jest.ts tests/core/parsers/jest.test.ts
git commit -m "feat: add parser registry and jest/vitest output parser"
```

---

### Task 3: TypeScript and ESLint Parsers

**Files:**
- Create: `src/core/parsers/typescript.ts`
- Create: `src/core/parsers/eslint.ts`
- Modify: `src/core/parsers/index.ts`
- Test: `tests/core/parsers/typescript.test.ts`
- Test: `tests/core/parsers/eslint.test.ts`

- [ ] **Step 1: Write failing test for TypeScript parser**

Create `tests/core/parsers/typescript.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseTypescript } from '../../../src/core/parsers/typescript.js';

const TSC_OUTPUT = `src/auth.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/types.ts(10,1): error TS2307: Cannot find module './missing' or its corresponding type declarations.
src/utils.ts(3,14): error TS7006: Parameter 'x' implicitly has an 'any' type.`;

describe('parseTypescript', () => {
  it('extracts file, line, rule, and message', () => {
    const errors = parseTypescript(TSC_OUTPUT);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({
      file: 'src/auth.ts',
      line: 42,
      message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
      rule: 'TS2345',
    });
  });

  it('extracts all errors', () => {
    const errors = parseTypescript(TSC_OUTPUT);
    expect(errors[1].file).toBe('src/types.ts');
    expect(errors[1].rule).toBe('TS2307');
    expect(errors[2].file).toBe('src/utils.ts');
    expect(errors[2].line).toBe(3);
  });

  it('returns empty array for clean output', () => {
    expect(parseTypescript('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Write failing test for ESLint parser**

Create `tests/core/parsers/eslint.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseEslint } from '../../../src/core/parsers/eslint.js';

const ESLINT_OUTPUT = `/Users/ruban/project/src/auth.ts
  42:5   error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  57:10  warning  'unused' is defined but never used        @typescript-eslint/no-unused-vars

/Users/ruban/project/src/utils.ts
  3:1  error  Missing return type on function  @typescript-eslint/explicit-function-return-type`;

describe('parseEslint', () => {
  it('extracts errors with file, line, message, and rule', () => {
    const errors = parseEslint(ESLINT_OUTPUT);
    expect(errors).toHaveLength(3);
    expect(errors[0].file).toContain('src/auth.ts');
    expect(errors[0].line).toBe(42);
    expect(errors[0].message).toContain('Unexpected any');
    expect(errors[0].rule).toBe('@typescript-eslint/no-explicit-any');
  });

  it('parses errors from multiple files', () => {
    const errors = parseEslint(ESLINT_OUTPUT);
    expect(errors[2].file).toContain('src/utils.ts');
    expect(errors[2].line).toBe(3);
  });

  it('returns empty array for clean output', () => {
    expect(parseEslint('')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/parsers/`
Expected: New tests FAIL — modules not found

- [ ] **Step 4: Implement TypeScript parser**

Create `src/core/parsers/typescript.ts`:

```typescript
import type { ParsedError } from '../../types.js';

export function parseTypescript(raw: string): ParsedError[] {
  const errors: ParsedError[] = [];
  // Pattern: file(line,col): error TSxxxx: message
  const pattern = /^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)$/gm;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      message: match[4],
      rule: match[3],
    });
  }
  return errors;
}
```

- [ ] **Step 5: Implement ESLint parser**

Create `src/core/parsers/eslint.ts`:

```typescript
import type { ParsedError } from '../../types.js';

export function parseEslint(raw: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = raw.split('\n');
  let currentFile: string | undefined;

  for (const line of lines) {
    // File path line: starts with / or drive letter, no leading whitespace
    if (line.match(/^\S/) && !line.match(/^\d+ problems?/)) {
      currentFile = line.trim();
      continue;
    }

    // Error line: "  42:5  error  message  rule"
    const errorMatch = line.match(/^\s+(\d+):\d+\s+(?:error|warning)\s+(.+?)\s{2,}(\S+)\s*$/);
    if (errorMatch && currentFile) {
      errors.push({
        file: currentFile,
        line: parseInt(errorMatch[1], 10),
        message: errorMatch[2].trim(),
        rule: errorMatch[3],
      });
    }
  }

  return errors;
}
```

- [ ] **Step 6: Register both parsers in `src/core/parsers/index.ts`**

```typescript
import type { ParsedError } from '../../types.js';
import { parseJest } from './jest.js';
import { parseTypescript } from './typescript.js';
import { parseEslint } from './eslint.js';

export type OutputParser = (raw: string) => ParsedError[];

const PARSERS: Record<string, OutputParser> = {
  jest: parseJest,
  vitest: parseJest,
  typescript: parseTypescript,
  eslint: parseEslint,
};

export function getParser(name: string): OutputParser | undefined {
  return PARSERS[name];
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/core/parsers/`
Expected: All parser tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/parsers/typescript.ts src/core/parsers/eslint.ts src/core/parsers/index.ts tests/core/parsers/typescript.test.ts tests/core/parsers/eslint.test.ts
git commit -m "feat: add typescript and eslint output parsers"
```

---

### Task 4: Pytest Parser

**Files:**
- Create: `src/core/parsers/pytest.ts`
- Modify: `src/core/parsers/index.ts`
- Test: `tests/core/parsers/pytest.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/core/parsers/pytest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parsePytest } from '../../../src/core/parsers/pytest.js';

const PYTEST_SHORT = `FAILED tests/test_auth.py::test_login_returns_token - AssertionError: assert None == {'token': 'abc123'}
FAILED tests/test_auth.py::test_session_expiry - ValueError: Session expired
PASSED tests/test_utils.py::test_format`;

const PYTEST_VERBOSE = `
=================================== FAILURES ===================================
_________________________________ test_login __________________________________

    def test_login():
        result = login("user")
>       assert result == {"token": "abc123"}
E       AssertionError: assert None == {'token': 'abc123'}

tests/test_auth.py:12: AssertionError
________________________________ test_session _________________________________

    def test_session():
>       raise ValueError("Session expired")
E       ValueError: Session expired

tests/test_auth.py:20: ValueError
=========================== short test summary info ============================
FAILED tests/test_auth.py::test_login - AssertionError: assert None == {'token': 'abc123'}
FAILED tests/test_auth.py::test_session - ValueError: Session expired
============================== 2 failed, 1 passed ==============================`;

describe('parsePytest', () => {
  it('extracts from short-form FAILED lines', () => {
    const errors = parsePytest(PYTEST_SHORT);
    expect(errors).toHaveLength(2);
    expect(errors[0].file).toBe('tests/test_auth.py');
    expect(errors[0].message).toContain('test_login_returns_token');
  });

  it('extracts from verbose output with FAILURES section', () => {
    const errors = parsePytest(PYTEST_VERBOSE);
    expect(errors).toHaveLength(2);
    expect(errors[0].file).toBe('tests/test_auth.py');
    expect(errors[0].message).toContain('test_login');
  });

  it('returns empty array for passing output', () => {
    expect(parsePytest('1 passed in 0.5s')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/parsers/pytest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement pytest parser**

Create `src/core/parsers/pytest.ts`:

```typescript
import type { ParsedError } from '../../types.js';

export function parsePytest(raw: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const seen = new Set<string>();

  // Match short-form: FAILED tests/test_auth.py::test_name - Error: message
  const shortPattern = /^FAILED\s+(.+?)::(\S+)\s*-\s*(.+)$/gm;
  let match;
  while ((match = shortPattern.exec(raw)) !== null) {
    const key = `${match[1]}::${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push({
        file: match[1],
        message: `${match[2]} — ${match[3].trim()}`,
      });
    }
  }

  // If no short-form matches, try verbose FAILURES section
  if (errors.length === 0) {
    // Match: tests/file.py:line: ErrorType
    const verbosePattern = /^(\S+\.py):(\d+):\s*(\S+)\s*$/gm;
    while ((match = verbosePattern.exec(raw)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        message: match[3],
      });
    }
  }

  return errors;
}
```

- [ ] **Step 4: Register in `src/core/parsers/index.ts`**

Add import and register:

```typescript
import { parsePytest } from './pytest.js';

// Add to PARSERS:
pytest: parsePytest,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/parsers/`
Expected: All parser tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/parsers/pytest.ts src/core/parsers/index.ts tests/core/parsers/pytest.test.ts
git commit -m "feat: add pytest output parser"
```

---

### Task 5: Integrate Parsers into Verifier

**Files:**
- Modify: `src/core/verifier.ts:1-45`
- Modify: `src/cli/commands/verify.ts:1-46`
- Modify: `src/config/loader.ts:1-20`
- Test: `tests/core/verifier.test.ts`
- Test: `tests/cli/verify.test.ts`

- [ ] **Step 1: Write failing test for verifier with VerifyCommand objects**

Add to `tests/core/verifier.test.ts`:

```typescript
import type { VerifyCommand } from '../../src/types.js';

describe('Verifier with VerifyCommand objects', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/verifier.test.ts`
Expected: FAIL — `runChecks` does not accept `VerifyCommand[]`

- [ ] **Step 3: Update `src/core/verifier.ts` to accept VerifyCommand[]**

```typescript
import { execaCommand } from 'execa';
import type { VerificationResult, VerificationCheck, VerifyCommand } from '../types.js';
import { getParser } from './parsers/index.js';

export class Verifier {
  async runChecks(cwd: string, commands: VerifyCommand[]): Promise<VerificationResult> {
    const checks: VerificationCheck[] = [];

    for (const entry of commands) {
      const cmd = typeof entry === 'string' ? entry : entry.cmd;
      const parserName = typeof entry === 'string' ? undefined : entry.parser;

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

        let parsed: import('../types.js').ParsedError[] | undefined;
        if (parserName) {
          const parser = getParser(parserName);
          if (parser && output) {
            const result = parser(output);
            if (result.length > 0) parsed = result;
          }
        }

        checks.push({
          cmd,
          passed,
          exit_code: result.exitCode ?? 1,
          duration_s,
          output: output || undefined,
          parsed,
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

- [ ] **Step 4: Update `src/config/loader.ts` to normalize VerifyCommand[]**

The config loader doesn't need changes — `js-yaml` will parse the YAML into the correct shapes. A plain string stays a string, an object with `cmd` and `parser` fields stays an object. The `VerifyCommand` union type handles both.

Verify this by checking that the existing `loadConfig` tests still pass.

- [ ] **Step 5: Update `src/cli/commands/verify.ts` to pass VerifyCommand[]**

Update the type of `verifyCommands`:

```typescript
import type { VerificationCheck, VerifyCommand } from '../../types.js';

// Change line 27:
const verifyCommands: VerifyCommand[] = config.verify || (await detectVerifyCommands(wtPath));
```

Note: `detectVerifyCommands` returns `string[]` which is a valid `VerifyCommand[]` since `string` is part of the union.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/verifier.test.ts tests/cli/verify.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/verifier.ts src/cli/commands/verify.ts src/config/loader.ts tests/core/verifier.test.ts
git commit -m "feat: integrate output parsers into verifier

Verifier accepts VerifyCommand[] (string or {cmd, parser}).
When parser is specified, structured ParsedError[] is extracted
from raw output and stored on the check."
```

---

### Task 6: Needs-Input Detection in Completion Handler

**Files:**
- Modify: `src/cli/commands/task-exec.ts:1-97`
- Test: `tests/cli/task-exec-needs-input.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/cli/task-exec-needs-input.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('needs-input detection', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    await writeFile(join(repo.path, '.agex', 'config.yml'), 'verify:\n  - "true"\n');
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
        execSync(`git worktree remove --force "${wt}"`, { cwd: repo.path, stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    await repo.cleanup();
  });

  it('transitions to needs-input when agent writes needs-input.json', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test task' });
    const wtPath = join(repo.path, task.worktree);

    // Agent command: write needs-input.json then exit
    const agentCmd = `mkdir -p .agex && echo '{"question":"Use JWT or sessions?","options":["jwt","sessions"]}' > .agex/needs-input.json`;

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: agentCmd,
      wait: true,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(updated!.status).toBe('needs-input');
    expect(updated!.needsInput).toBeDefined();
    expect(updated!.needsInput!.question).toBe('Use JWT or sessions?');
    expect(updated!.needsInput!.options).toEqual(['jwt', 'sessions']);
  });

  it('proceeds to verify when no needs-input.json exists', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test task' });

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: 'echo "doing work"',
      wait: true,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    expect(updated!.status).toBe('completed');
    expect(updated!.needsInput).toBeUndefined();
  });

  it('proceeds to verify when needs-input.json is malformed', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test task' });

    // Write malformed JSON (no question field)
    const agentCmd = `mkdir -p .agex && echo '{"notaquestion":"bad"}' > .agex/needs-input.json`;

    const result = await taskExecCommand(repo.path, task.id, {
      cmd: agentCmd,
      wait: true,
    });

    const tm = new TaskManager(repo.path);
    const updated = await tm.getTask(task.id);
    // Should proceed to verify, not needs-input
    expect(['completed', 'failed']).toContain(updated!.status);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/task-exec-needs-input.test.ts`
Expected: FAIL — task transitions to `completed` instead of `needs-input`

- [ ] **Step 3: Implement needs-input detection in `task-exec.ts`**

Add a helper function and integrate into both blocking and non-blocking paths. At the top of the file, add:

```typescript
import { readFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { NeedsInputPayload } from '../../types.js';

export async function checkNeedsInput(wtPath: string): Promise<NeedsInputPayload | null> {
  const filePath = join(wtPath, '.agex', 'needs-input.json');
  try {
    await access(filePath);
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (typeof data.question !== 'string' || !data.question) {
      return null; // malformed
    }
    // Clean up the file
    await unlink(filePath);
    return {
      question: data.question,
      options: Array.isArray(data.options) ? data.options : undefined,
      context: typeof data.context === 'string' ? data.context : undefined,
    };
  } catch {
    return null; // file doesn't exist or can't be read
  }
}
```

In the blocking path (after `runner.run` returns, before verify), add:

```typescript
// Check for needs-input signal
const needsInput = await checkNeedsInput(wtPath);
if (needsInput) {
  await tm.updateTask(taskId, { needsInput, cmd: options.cmd });
  return await tm.updateStatus(taskId, 'needs-input');
}
```

In the non-blocking `handle.done.then` callback (after `updateTask` with exit_code, before verify), add the same check:

```typescript
const needsInput = await checkNeedsInput(wtPath);
if (needsInput) {
  await tm.updateTask(taskId, { needsInput, cmd: options.cmd });
  await tm.updateStatus(taskId, 'needs-input');
  return; // skip verify
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/task-exec-needs-input.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/task-exec.ts tests/cli/task-exec-needs-input.test.ts
git commit -m "feat: detect needs-input.json after agent exit

When agent writes .agex/needs-input.json in worktree, task
transitions to needs-input state instead of running verify.
Malformed files are ignored and verify proceeds normally."
```

---

### Task 7: Respond Command

**Files:**
- Create: `src/cli/commands/respond.ts`
- Modify: `src/index.ts`
- Modify: `src/mcp/tools.ts`
- Test: `tests/cli/respond.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/cli/respond.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { respondCommand } from '../../src/cli/commands/respond.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('respondCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    await writeFile(join(repo.path, '.agex', 'config.yml'), 'verify:\n  - "true"\n');
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
        execSync(`git worktree remove --force "${wt}"`, { cwd: repo.path, stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    await repo.cleanup();
  });

  it('rejects respond on task not in needs-input state', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });

    await expect(
      respondCommand(repo.path, task.id, { answer: 'jwt', cmd: 'echo ok' })
    ).rejects.toThrow(/needs-input/i);
  });

  it('appends QA pair to responses and clears needsInput', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    const tm = new TaskManager(repo.path);

    // Force to needs-input state
    const taskData = await tm.getTask(task.id);
    taskData!.status = 'needs-input' as any;
    taskData!.needsInput = { question: 'Use JWT or sessions?' };
    taskData!.cmd = 'echo "working"';
    await tm.saveTask(taskData!);

    const result = await respondCommand(repo.path, task.id, {
      answer: 'jwt',
      cmd: 'echo "continuing"',
      wait: true,
    });

    const updated = await tm.getTask(task.id);
    expect(updated!.responses).toHaveLength(1);
    expect(updated!.responses![0].question).toBe('Use JWT or sessions?');
    expect(updated!.responses![0].answer).toBe('jwt');
    expect(updated!.responses![0].round).toBe(1);
    expect(updated!.needsInput).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/respond.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement respond command**

Create `src/cli/commands/respond.ts`:

```typescript
import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { taskExecCommand } from './task-exec.js';
import type { TaskRecord, QAPair } from '../../types.js';

export interface RespondOptions {
  answer: string;
  cmd?: string;
  wait?: boolean;
}

function buildRespondPrompt(task: TaskRecord, answer: string): string {
  const responses: QAPair[] = [
    ...(task.responses || []),
    {
      question: task.needsInput!.question,
      answer,
      round: (task.responses?.length || 0) + 1,
    },
  ];

  let prompt = task.prompt;
  prompt += '\n\n## Previous Q&A\n';
  for (const qa of responses) {
    prompt += `\nQ${qa.round}: ${qa.question}\nA${qa.round}: ${qa.answer}\n`;
  }

  return prompt;
}

export async function respondCommand(
  repoRoot: string,
  taskId: string,
  options: RespondOptions
): Promise<TaskRecord> {
  const tm = new TaskManager(repoRoot);
  const task = await tm.getTask(taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (task.status !== 'needs-input') {
    throw new Error(
      `Task ${taskId} is in '${task.status}' state, not 'needs-input'. Cannot respond.`
    );
  }

  if (!task.needsInput) {
    throw new Error(`Task ${taskId} has no pending question.`);
  }

  // Build enhanced prompt with Q&A history
  const enhancedPrompt = buildRespondPrompt(task, options.answer);

  // Append to responses, clear needsInput
  const newQA: QAPair = {
    question: task.needsInput.question,
    answer: options.answer,
    round: (task.responses?.length || 0) + 1,
  };
  const responses = [...(task.responses || []), newQA];
  await tm.updateTask(taskId, {
    responses,
    needsInput: undefined,
  } as any);

  // Transition back to running state
  await tm.updateStatus(taskId, 'running');

  // Re-execute agent with enhanced prompt in the same worktree
  const cmd = options.cmd || task.cmd;
  if (!cmd) {
    throw new Error(`No command specified and task has no previous cmd.`);
  }

  // We need to re-run the agent — but the task is already in running state
  // and has a worktree. We can't use taskExecCommand (it expects 'ready').
  // Instead, use AgentRunner directly.
  const { AgentRunner } = await import('../../core/agent-runner.js');
  const { Verifier } = await import('../../core/verifier.js');
  const { loadConfig } = await import('../../config/loader.js');
  const { detectVerifyCommands } = await import('../../config/auto-detect.js');

  const runner = new AgentRunner(repoRoot);
  const verifier = new Verifier();
  const config = await loadConfig(repoRoot);
  const wtPath = resolve(repoRoot, task.worktree);

  if (options.wait) {
    const runResult = await runner.run(taskId, cmd, wtPath, {
      ...task.env,
      AGEX_PROMPT: enhancedPrompt,
    });
    await tm.updateTask(taskId, { exit_code: runResult.exitCode, cmd });

    // Check needs-input again (agent might ask another question)
    const { checkNeedsInput } = await import('./task-exec.js');
    const needsInput = await checkNeedsInput(wtPath);
    if (needsInput) {
      await tm.updateTask(taskId, { needsInput, cmd });
      return await tm.updateStatus(taskId, 'needs-input');
    }

    // Run verification
    const verifyCommands = config.verify || (await detectVerifyCommands(wtPath));
    await tm.updateStatus(taskId, 'verifying');
    const verification = await verifier.runChecks(wtPath, verifyCommands);
    await tm.updateTask(taskId, { verification });

    const { Reviewer } = await import('../../core/reviewer.js');
    const reviewer = new Reviewer(repoRoot);
    const diff_stats = await reviewer.getDiff(task.branch);
    await tm.updateTask(taskId, { diff_stats });

    const finalStatus = verification.passed ? 'completed' : 'failed';
    return await tm.updateStatus(taskId, finalStatus);
  } else {
    const handle = runner.spawn(taskId, cmd, wtPath, {
      ...task.env,
      AGEX_PROMPT: enhancedPrompt,
    });
    await tm.updateTask(taskId, { pid: handle.pid, cmd });

    handle.done.then(async (runResult) => {
      try {
        await tm.updateTask(taskId, { exit_code: runResult.exitCode });

        const { checkNeedsInput } = await import('./task-exec.js');
        const needsInput = await checkNeedsInput(wtPath);
        if (needsInput) {
          await tm.updateTask(taskId, { needsInput, cmd });
          await tm.updateStatus(taskId, 'needs-input');
          return;
        }

        const verifyCommands = config.verify || (await detectVerifyCommands(wtPath));
        await tm.updateStatus(taskId, 'verifying');
        const verification = await verifier.runChecks(wtPath, verifyCommands);
        await tm.updateTask(taskId, { verification });

        const { Reviewer } = await import('../../core/reviewer.js');
        const rev = new Reviewer(repoRoot);
        const diff_stats = await rev.getDiff(task.branch);
        await tm.updateTask(taskId, { diff_stats });

        const finalStatus = verification.passed ? 'completed' : 'failed';
        await tm.updateStatus(taskId, finalStatus);
      } catch (err) {
        try {
          await tm.updateTask(taskId, { error: err instanceof Error ? err.message : String(err) });
          await tm.updateStatus(taskId, 'errored');
        } catch { /* swallow */ }
      }
    });

    return (await tm.getTask(taskId))!;
  }
}
```

**Important:** The `checkNeedsInput` function must be exported from `task-exec.ts` so `respond.ts` can reuse it. In Task 6 Step 3, make sure the function is declared as `export async function checkNeedsInput(...)` not just a local function.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/respond.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/respond.ts tests/cli/respond.test.ts
git commit -m "feat: add agex respond command

Re-executes agent with Q&A context when task is in needs-input
state. Appends answer to responses history, clears needsInput,
and handles both blocking and non-blocking execution."
```

---

### Task 8: Retry Command

**Files:**
- Create: `src/cli/commands/retry.ts`
- Modify: `src/core/workspace-manager.ts`
- Test: `tests/cli/retry.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/cli/retry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { retryCommand } from '../../src/cli/commands/retry.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('retryCommand', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    await writeFile(join(repo.path, '.agex', 'config.yml'), 'verify:\n  - "true"\n');
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
        execSync(`git worktree remove --force "${wt}"`, { cwd: repo.path, stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    await repo.cleanup();
  });

  it('rejects retry on task not in failed/errored/completed', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });

    await expect(
      retryCommand(repo.path, task.id, { feedback: 'fix it', cmd: 'echo ok' })
    ).rejects.toThrow(/cannot retry/i);
  });

  it('creates new task with retry metadata', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'original task' });
    const tm = new TaskManager(repo.path);

    // Force to failed state
    const taskData = await tm.getTask(task.id);
    taskData!.status = 'failed' as any;
    taskData!.cmd = 'echo "original"';
    taskData!.verification = {
      passed: false,
      checks: [{ cmd: 'npm test', passed: false, exit_code: 1, duration_s: 1, output: 'test failed' }],
    };
    await tm.saveTask(taskData!);

    const result = await retryCommand(repo.path, task.id, {
      feedback: 'fix the auth test',
      cmd: 'echo "retrying"',
      wait: true,
    });

    expect(result.retriedFrom).toBe(task.id);
    expect(result.retryDepth).toBe(1);
    expect(result.retryFeedback).toBe('fix the auth test');
    expect(result.prompt).toContain('original task');
    expect(result.prompt).toContain('fix the auth test');
    expect(result.prompt).toContain('Previous attempt failed');
  });

  it('transitions original task to retried', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    const tm = new TaskManager(repo.path);

    const taskData = await tm.getTask(task.id);
    taskData!.status = 'failed' as any;
    taskData!.cmd = 'echo "original"';
    await tm.saveTask(taskData!);

    await retryCommand(repo.path, task.id, {
      feedback: 'try again',
      cmd: 'echo "retry"',
      wait: true,
    });

    const original = await tm.getTask(task.id);
    expect(original!.status).toBe('retried');
  });

  it('builds prompt with structured verify output when available', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'refactor auth' });
    const tm = new TaskManager(repo.path);

    const taskData = await tm.getTask(task.id);
    taskData!.status = 'failed' as any;
    taskData!.cmd = 'echo ok';
    taskData!.verification = {
      passed: false,
      checks: [{
        cmd: 'npm test',
        passed: false,
        exit_code: 1,
        duration_s: 1,
        output: 'raw output',
        parsed: [{ file: 'src/auth.ts', line: 13, message: 'login failed', expected: '"token"', actual: 'undefined' }],
      }],
    };
    await tm.saveTask(taskData!);

    const result = await retryCommand(repo.path, task.id, {
      feedback: 'fix login',
      cmd: 'echo ok',
      dryRun: true,
    });

    // dry-run returns the prompt as a string
    expect(result.prompt).toContain('src/auth.ts:13');
    expect(result.prompt).toContain('login failed');
    expect(result.prompt).toContain('Expected: "token"');
    expect(result.prompt).toContain('fix login');
  });

  it('rejects retry on already-retried task', async () => {
    const task = await taskCreateCommand(repo.path, { prompt: 'test' });
    const tm = new TaskManager(repo.path);

    const taskData = await tm.getTask(task.id);
    taskData!.status = 'retried' as any;
    await tm.saveTask(taskData!);

    await expect(
      retryCommand(repo.path, task.id, { feedback: 'try again', cmd: 'echo ok' })
    ).rejects.toThrow(/cannot retry/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/retry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add `createWorktreeFromBranch` to WorkspaceManager**

Add to `src/core/workspace-manager.ts`:

```typescript
async createWorktreeFromBranch(taskId: string, newBranch: string, baseBranch: string): Promise<string> {
  const git = simpleGit(this.repoRoot);
  const wtPath = worktreePath(this.repoRoot, taskId);

  // Create new branch from baseBranch and check it out in worktree
  await git.raw(['worktree', 'add', '-b', newBranch, wtPath, baseBranch]);

  return wtPath;
}
```

- [ ] **Step 4: Implement retry command**

Create `src/cli/commands/retry.ts`:

```typescript
import { resolve } from 'node:path';
import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { loadConfig } from '../../config/loader.js';
import { taskExecCommand } from './task-exec.js';
import type { TaskRecord } from '../../types.js';

export interface RetryOptions {
  feedback: string;
  cmd?: string;
  fromScratch?: boolean;
  dryRun?: boolean;
  wait?: boolean;
}

const RETRYABLE_STATUSES = ['failed', 'errored', 'completed'];

export function buildRetryPrompt(original: TaskRecord, feedback: string): string {
  let prompt = original.prompt;

  if (original.verification && !original.verification.passed) {
    prompt += '\n\n## Previous attempt failed\n';
    for (const check of original.verification.checks) {
      if (!check.passed) {
        prompt += `\n### ${check.cmd} (exit ${check.exit_code})\n`;
        if (check.parsed && check.parsed.length > 0) {
          for (const err of check.parsed) {
            prompt += `- ${err.file || ''}`;
            if (err.line) prompt += `:${err.line}`;
            prompt += ` — ${err.message}`;
            if (err.expected) prompt += `\n  Expected: ${err.expected}`;
            if (err.actual) prompt += `\n  Actual: ${err.actual}`;
            prompt += '\n';
          }
        } else if (check.output) {
          const lines = check.output.split('\n');
          const tail = lines.slice(-30).join('\n');
          prompt += `\`\`\`\n${tail}\n\`\`\`\n`;
        }
      }
    }
  }

  prompt += `\n\n## Feedback\n${feedback}`;
  return prompt;
}

export async function retryCommand(
  repoRoot: string,
  taskId: string,
  options: RetryOptions
): Promise<TaskRecord & { prompt: string }> {
  const tm = new TaskManager(repoRoot);
  const original = await tm.getTask(taskId);

  if (!original) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (!RETRYABLE_STATUSES.includes(original.status)) {
    throw new Error(
      `Cannot retry task in '${original.status}' state. Must be: ${RETRYABLE_STATUSES.join(', ')}`
    );
  }

  const enhancedPrompt = buildRetryPrompt(original, options.feedback);

  // Dry run: return prompt without creating task
  if (options.dryRun) {
    return { ...original, prompt: enhancedPrompt };
  }

  const config = await loadConfig(repoRoot);
  const wm = new WorkspaceManager(repoRoot);
  const cmd = options.cmd || original.cmd;

  if (!cmd) {
    throw new Error('No command specified and original task has no cmd.');
  }

  // Create new task
  const retryDepth = (original.retryDepth || 0) + 1;
  const newTask = await tm.createTask({ prompt: enhancedPrompt, cmd });

  // Store retry metadata
  await tm.updateTask(newTask.id, {
    retriedFrom: original.id,
    retryDepth,
    retryFeedback: options.feedback,
    retryFromScratch: options.fromScratch || false,
  } as any);

  // Transition to provisioning
  await tm.updateStatus(newTask.id, 'provisioning');

  // Create worktree from appropriate base
  const baseBranch = options.fromScratch ? 'HEAD' : original.branch;
  await wm.createWorktreeFromBranch(newTask.id, newTask.branch, baseBranch);

  // Provision
  await wm.provision(newTask.id, {
    copy: config.copy,
    symlink: config.symlink,
  });

  if (config.setup && config.setup.length > 0) {
    await wm.runSetupHooks(newTask.id, config.setup);
  }

  await tm.updateStatus(newTask.id, 'ready');

  // Transition original to retried
  await tm.updateStatus(original.id, 'retried');

  // Execute
  const result = await taskExecCommand(repoRoot, newTask.id, {
    cmd,
    wait: options.wait,
  });

  return { ...result, prompt: enhancedPrompt };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/cli/retry.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/retry.ts src/core/workspace-manager.ts tests/cli/retry.test.ts
git commit -m "feat: add agex retry command

Creates new task branching from failed task's branch (or main with
--from-scratch). Constructs enhanced prompt with original + structured
verify output + feedback. Transitions original to retried state."
```

---

### Task 9: Wire CLI Commands and MCP Tools

**Files:**
- Modify: `src/index.ts`
- Modify: `src/mcp/tools.ts`

- [ ] **Step 1: Wire retry command in `src/index.ts`**

Add import at top:

```typescript
import { retryCommand } from './cli/commands/retry.js';
import { respondCommand } from './cli/commands/respond.js';
import {
  // ... existing imports ...
  formatRetryHuman,
  formatRetryDryRunHuman,
  formatRespondHuman,
} from './cli/format/human.js';
```

Add commander registration after the existing commands:

```typescript
program
  .command('retry <taskId>')
  .description('Retry a failed task with feedback')
  .requiredOption('--feedback <text>', 'Feedback for the retry')
  .option('--from-scratch', 'Branch from main instead of failed task', false)
  .option('--dry-run', 'Preview the retry prompt without creating a task', false)
  .option('--cmd <command>', 'Agent command to run')
  .option('--wait', 'Wait for agent to complete', false)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (taskId, opts) => {
    try {
      isHumanMode = opts.human;
      const repoRoot = getRepoRoot();
      requireInit(repoRoot);
      const id = resolveTaskId(taskId);
      const result = await retryCommand(repoRoot, id, {
        feedback: opts.feedback,
        fromScratch: opts.fromScratch,
        dryRun: opts.dryRun,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      if (opts.dryRun) {
        console.log(opts.human ? humanOutput(formatRetryDryRunHuman(result.prompt)) : formatOutput({ prompt: result.prompt }, false));
      } else {
        console.log(opts.human ? humanOutput(formatRetryHuman(result)) : formatOutput(result, false));
      }
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });

program
  .command('respond <taskId>')
  .description('Answer a question from a task in needs-input state')
  .requiredOption('--answer <text>', 'Your answer to the task question')
  .option('--cmd <command>', 'Agent command to re-run')
  .option('--wait', 'Wait for agent to complete', false)
  .option('-H, --human', 'Human-friendly output', false)
  .action(async (taskId, opts) => {
    try {
      isHumanMode = opts.human;
      const repoRoot = getRepoRoot();
      requireInit(repoRoot);
      const id = resolveTaskId(taskId);
      const result = await respondCommand(repoRoot, id, {
        answer: opts.answer,
        cmd: opts.cmd,
        wait: opts.wait,
      });
      console.log(opts.human ? humanOutput(formatRespondHuman(result)) : formatOutput(result, false));
    } catch (err) {
      handleError(err, EXIT_CODES.INVALID_ARGS);
    }
  });
```

- [ ] **Step 2: Wire MCP tools in `src/mcp/tools.ts`**

Add imports and two new tool definitions:

```typescript
import { retryCommand } from '../cli/commands/retry.js';
import { respondCommand } from '../cli/commands/respond.js';

// Add to the tools array:
{
  name: 'agex_retry',
  description: 'Retry a failed task with feedback. Creates a new task branching from the failed task with an enhanced prompt.',
  inputSchema: {
    taskId: z.string().describe('ID of the task to retry'),
    feedback: z.string().describe('Feedback explaining what to fix'),
    cmd: z.string().optional().describe('Agent command to run'),
    fromScratch: z.boolean().optional().describe('Branch from main instead of failed task'),
    dryRun: z.boolean().optional().describe('Preview prompt without creating task'),
    wait: z.boolean().optional().describe('Wait for agent to complete'),
  },
  handler: async (args) => {
    return await retryCommand(getRepoRoot(), args.taskId as string, {
      feedback: args.feedback as string,
      cmd: args.cmd as string | undefined,
      fromScratch: args.fromScratch as boolean | undefined,
      dryRun: args.dryRun as boolean | undefined,
      wait: args.wait as boolean | undefined,
    });
  },
},
{
  name: 'agex_respond',
  description: 'Answer a question from a task in needs-input state. Re-executes the agent with Q&A context.',
  inputSchema: {
    taskId: z.string().describe('ID of the task to respond to'),
    answer: z.string().describe('Your answer to the task question'),
    cmd: z.string().optional().describe('Agent command to re-run'),
    wait: z.boolean().optional().describe('Wait for agent to complete'),
  },
  handler: async (args) => {
    return await respondCommand(getRepoRoot(), args.taskId as string, {
      answer: args.answer as string,
      cmd: args.cmd as string | undefined,
      wait: args.wait as boolean | undefined,
    });
  },
},
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Smoke test CLI**

Run:
```bash
npx tsx src/index.ts retry --help
npx tsx src/index.ts respond --help
```
Expected: Both show usage with correct options

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/mcp/tools.ts
git commit -m "feat: wire retry and respond commands into CLI and MCP"
```

---

### Task 10: Human Formatter Updates

**Files:**
- Modify: `src/cli/format/human.ts`
- Test: `tests/cli/format/human.test.ts`

- [ ] **Step 1: Add new formatter functions to `src/cli/format/human.ts`**

Add the following functions. Update the `nextActionForStatus` function first:

```typescript
function nextActionForStatus(id: string, status: TaskStatus): string | null {
  switch (status) {
    case 'completed': return `agex diff ${id} to review, agex merge ${id} to accept`;
    case 'failed': return `agex retry ${id} --feedback "..." to retry, agex log ${id} to see output`;
    case 'errored': return `agex retry ${id} --feedback "..." to retry, agex log ${id} to see output`;
    case 'needs-input': return `agex respond ${id} --answer "..." to continue`;
    case 'running': return `agex task status ${id} to check progress`;
    case 'ready': return `agex task exec ${id} --cmd "..." --wait`;
    case 'retried': return null;
    default: return null;
  }
}
```

Update `formatStatusHuman` to show needs-input question and retry lineage in the details section. After the existing "Details" section:

```typescript
// Needs-input section
if (task.status === 'needs-input' && task.needsInput) {
  lines.push(sectionHeader('Waiting for Input'));
  lines.push(`  ${yellow('?')} ${bold(task.needsInput.question)}`);
  if (task.needsInput.options) {
    for (const opt of task.needsInput.options) {
      lines.push(`    ${dim('•')} ${opt}`);
    }
  }
  if (task.needsInput.context) {
    lines.push(`  ${dim(task.needsInput.context)}`);
  }
  lines.push('');
}

// Retry lineage
if (task.retriedFrom) {
  lines.push(`  ${dim('retry of:')} ${task.retriedFrom}${task.retryDepth ? ` (depth: ${task.retryDepth})` : ''}`);
}
```

Update the verification section to show parsed errors:

```typescript
if (task.verification && task.verification.checks.length > 0) {
  lines.push(sectionHeader('Verification'));
  for (const check of task.verification.checks) {
    lines.push(`  ${checkSymbol(check.passed)} ${check.cmd}  ${dim(`(${check.duration_s}s)`)}`);
    if (!check.passed) {
      if (check.parsed && check.parsed.length > 0) {
        for (const err of check.parsed.slice(0, 5)) {
          let errLine = `    ${red('→')} `;
          if (err.file) errLine += `${err.file}`;
          if (err.line) errLine += `:${err.line}`;
          if (err.file || err.line) errLine += ` — `;
          errLine += err.message;
          lines.push(errLine);
          if (err.expected) lines.push(`      ${dim('expected:')} ${err.expected}`);
          if (err.actual) lines.push(`      ${dim('actual:')}   ${err.actual}`);
        }
        if (check.parsed.length > 5) {
          lines.push(`    ${dim(`... and ${check.parsed.length - 5} more errors`)}`);
        }
      } else if (check.output) {
        const firstLine = check.output.trim().split('\n')[0];
        lines.push(`    ${red(firstLine)}`);
      }
    }
  }
  lines.push('');
}
```

Add new export functions:

```typescript
export function formatRetryHuman(task: TaskRecord): string {
  const color = cardColorForStatus(task.status);
  const lines: string[] = [];
  lines.push(card(color, [
    `${bold('↻ Retry created')}  ${blue(task.id)}`,
    `Retry of ${dim(task.retriedFrom || '?')} (depth: ${task.retryDepth || 1})`,
    task.prompt.length > 60 ? task.prompt.slice(0, 57) + '...' : task.prompt,
  ]));
  const hint = nextActionForStatus(task.id, task.status);
  if (hint) lines.push(nextAction(hint));
  return lines.join('\n');
}

export function formatRetryDryRunHuman(prompt: string): string {
  const lines: string[] = [];
  lines.push(sectionHeader('Retry Prompt Preview'));
  lines.push('');
  for (const line of prompt.split('\n')) {
    lines.push(`  ${line}`);
  }
  lines.push('');
  lines.push(dim('No task created. Remove --dry-run to execute.'));
  return lines.join('\n');
}

export function formatRespondHuman(task: TaskRecord): string {
  const color = cardColorForStatus(task.status);
  return card(color, [
    `${bold('Answer saved.')} Resuming task ${blue(task.id)}...`,
  ]);
}
```

- [ ] **Step 2: Update exports in `human.ts`**

Make sure `formatRetryHuman`, `formatRetryDryRunHuman`, and `formatRespondHuman` are exported and the import in `src/index.ts` (from Task 9) matches.

- [ ] **Step 3: Update existing format tests if needed**

Check `tests/cli/format/human.test.ts` for any tests that hardcode status lists or format functions. Add basic tests for the new formatters:

```typescript
describe('v0.2.0 formatters', () => {
  it('formatRetryDryRunHuman shows prompt preview', () => {
    const result = formatRetryDryRunHuman('original prompt\n\n## Feedback\nfix it');
    expect(result).toContain('Retry Prompt Preview');
    expect(result).toContain('original prompt');
    expect(result).toContain('fix it');
    expect(result).toContain('No task created');
  });
});
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/format/human.ts tests/cli/format/human.test.ts
git commit -m "feat: update human formatter for retry, respond, needs-input, and parsed errors

Show parsed verify errors with file:line, expected/actual.
Show needs-input question prominently with options.
Show retry lineage. Add formatRetryHuman, formatRetryDryRunHuman,
formatRespondHuman functions."
```

---

### Task 11: Integration Test — Full Retry Workflow

**Files:**
- Test: `tests/integration/retry-workflow.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/retry-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { retryCommand } from '../../src/cli/commands/retry.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('retry workflow integration', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    // Configure verify to run a script that checks for a file
    await writeFile(
      join(repo.path, '.agex', 'config.yml'),
      'verify:\n  - "test -f result.txt"\n'
    );
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
        execSync(`git worktree remove --force "${wt}"`, { cwd: repo.path, stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    await repo.cleanup();
  });

  it('full cycle: create → fail → retry → succeed', async () => {
    const tm = new TaskManager(repo.path);

    // Step 1: Create and run task that fails (doesn't create result.txt)
    const task = await taskCreateCommand(repo.path, { prompt: 'create result file' });
    const failed = await taskExecCommand(repo.path, task.id, {
      cmd: 'echo "oops, forgot to create the file"',
      wait: true,
    });

    const failedTask = await tm.getTask(task.id);
    expect(failedTask!.status).toBe('failed');

    // Step 2: Retry with feedback — this time create the file
    const retried = await retryCommand(repo.path, task.id, {
      feedback: 'You need to create result.txt',
      cmd: 'echo "done" > result.txt',
      wait: true,
    });

    // Original should be retried
    const original = await tm.getTask(task.id);
    expect(original!.status).toBe('retried');

    // New task should be completed
    const newTask = await tm.getTask(retried.id);
    expect(newTask!.status).toBe('completed');
    expect(newTask!.retriedFrom).toBe(task.id);
    expect(newTask!.retryDepth).toBe(1);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/integration/retry-workflow.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/retry-workflow.test.ts
git commit -m "test: add integration test for full retry workflow"
```

---

### Task 12: Integration Test — Needs-Input Workflow

**Files:**
- Test: `tests/integration/needs-input-workflow.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/needs-input-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { taskCreateCommand } from '../../src/cli/commands/task-create.js';
import { taskExecCommand } from '../../src/cli/commands/task-exec.js';
import { respondCommand } from '../../src/cli/commands/respond.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { createTestRepoWithAgex, type TestRepo } from '../helpers/test-repo.js';

describe('needs-input workflow integration', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepoWithAgex();
    await writeFile(join(repo.path, '.agex', 'config.yml'), 'verify:\n  - "true"\n');
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
        execSync(`git worktree remove --force "${wt}"`, { cwd: repo.path, stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    await repo.cleanup();
  });

  it('full cycle: create → needs-input → respond → complete', async () => {
    const tm = new TaskManager(repo.path);

    // Step 1: Create and run task that asks a question
    const task = await taskCreateCommand(repo.path, { prompt: 'implement auth' });
    await taskExecCommand(repo.path, task.id, {
      cmd: 'mkdir -p .agex && echo \'{"question":"Use JWT or sessions?","options":["jwt","sessions"]}\' > .agex/needs-input.json',
      wait: true,
    });

    const paused = await tm.getTask(task.id);
    expect(paused!.status).toBe('needs-input');
    expect(paused!.needsInput!.question).toBe('Use JWT or sessions?');

    // Step 2: Respond — agent completes successfully this time
    await respondCommand(repo.path, task.id, {
      answer: 'jwt',
      cmd: 'echo "using jwt"',
      wait: true,
    });

    const completed = await tm.getTask(task.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.responses).toHaveLength(1);
    expect(completed!.responses![0].answer).toBe('jwt');
    expect(completed!.needsInput).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/integration/needs-input-workflow.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL TESTS PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/needs-input-workflow.test.ts
git commit -m "test: add integration test for needs-input workflow"
```

---

### Task 13: Final Verification and Cleanup

- [ ] **Step 1: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests PASS with zero failures

- [ ] **Step 2: Check for TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npm run lint` (if configured)
Expected: No errors

- [ ] **Step 4: Verify CLI help output**

Run:
```bash
npx tsx src/index.ts --help
npx tsx src/index.ts retry --help
npx tsx src/index.ts respond --help
```
Expected: All three show correct usage

- [ ] **Step 5: Commit any final fixes**

If any issues were found and fixed:
```bash
git add -A
git commit -m "fix: resolve issues found during final verification"
```

import { ActivityLogger } from '../../core/activity-logger.js';
import { extractToolInput } from '../../core/transcript-parser.js';
import type { ActivityEventType } from '../../types.js';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { loadSessionRegistry } from '../../core/session-registry.js';

// --- Types ---

export interface HookRoute {
  repoRoot: string;
  taskId: string;
}

export interface HookPayload {
  cwd?: string;
  session_id?: string;
  tool_input?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HookEventData {
  event: ActivityEventType;
  data: Record<string, unknown>;
}

// --- Routing ---

const WORKTREE_RE = /\/\.agex\/tasks\/([^/.]+)(?=\/|$)/;

function findRepoRoot(cwd: string | undefined): string | null {
  if (!cwd) return null;

  // 1. cwd sits inside a worktree — repoRoot is the prefix before /.agex/tasks/
  const m = WORKTREE_RE.exec(cwd);
  if (m) return cwd.slice(0, m.index);

  // 2. Walk upward from cwd looking for a directory that contains .agex/
  let dir = cwd;
  while (dir && dir !== dirname(dir)) {
    if (existsSync(join(dir, '.agex'))) return dir;
    dir = dirname(dir);
  }

  // 3. Last resort — ask git. Useful when cwd is a symlink or a subdir
  //    of a non-agex-initialized repo that still has .agex at toplevel.
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (top && existsSync(join(top, '.agex'))) return top;
  } catch {
    // git not available / not a repo — fall through
  }
  return null;
}

export function routeHookEvent(payload: HookPayload): HookRoute | null {
  const cwd = payload.cwd ?? '';
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;

  // Tier 1: session_id registry.
  if (sessionId) {
    const repoRoot = findRepoRoot(cwd);
    if (repoRoot) {
      const entry = loadSessionRegistry(repoRoot).lookup(sessionId);
      if (entry) return { repoRoot: entry.repoRoot, taskId: entry.taskId };
    }
  }

  // Tier 2: cwd regex match (existing behavior). Populates the registry on hit.
  const cwdMatch = WORKTREE_RE.exec(cwd);
  if (cwdMatch) {
    const taskId = cwdMatch[1];
    const repoRoot = cwd.slice(0, cwdMatch.index);
    if (sessionId) {
      try {
        loadSessionRegistry(repoRoot).register(sessionId, { taskId, repoRoot });
      } catch {
        // non-fatal; tier 2 still succeeds
      }
    }
    return { repoRoot, taskId };
  }

  // Tier 3: tool_input path regex. Does NOT write to the registry.
  const input = (payload.tool_input ?? {}) as Record<string, unknown>;
  const candidatePaths = [input.file_path, input.path, input.notebook_path]
    .filter((p): p is string => typeof p === 'string');

  for (const p of candidatePaths) {
    const m = WORKTREE_RE.exec(p);
    if (m) {
      const repoRoot = p.slice(0, m.index);
      return { repoRoot, taskId: m[1] };
    }
  }

  return null;
}

// --- Event extraction ---

const HOOK_EVENT_MAP: Record<string, (payload: Record<string, unknown>) => HookEventData | null> = {
  'post-tool': (payload) => {
    const tool = (payload.tool_name ?? payload.tool) as string;
    const toolUseId = payload.tool_use_id as string;
    const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;
    const extracted = extractToolInput(tool, toolInput);
    return {
      event: 'tool.call',
      data: {
        tool,
        tool_use_id: toolUseId,
        ...extracted,
      },
    };
  },

  'post-tool-failure': (payload) => {
    const tool = (payload.tool_name ?? payload.tool) as string;
    const toolUseId = payload.tool_use_id as string;
    const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;
    const extracted = extractToolInput(tool, toolInput);
    return {
      event: 'tool.failed',
      data: {
        tool,
        tool_use_id: toolUseId,
        ...extracted,
        error: payload.error,
        is_interrupt: payload.is_interrupt,
      },
    };
  },

  'turn-end': () => ({
    event: 'turn.end',
    data: {},
  }),

  'subagent-start': (payload) => ({
    event: 'subagent.started',
    data: {
      agent_id: payload.agent_id,
      agent_type: payload.agent_type,
    },
  }),

  'subagent-stop': (payload) => ({
    event: 'subagent.completed',
    data: {
      agent_id: payload.agent_id,
      agent_type: payload.agent_type,
      agent_transcript_path: payload.agent_transcript_path,
    },
  }),

  'session-end': () => ({
    event: 'session.end',
    data: {},
  }),

  'cwd-changed': (payload) => ({
    event: 'cwd.changed',
    data: {
      cwd: payload.cwd,
    },
  }),
};

export function extractHookData(
  hookEvent: string,
  payload: Record<string, unknown>,
): HookEventData | null {
  const handler = HOOK_EVENT_MAP[hookEvent];
  if (!handler) return null;
  return handler(payload);
}

// --- Processing ---

export async function processHookPayload(
  hookEvent: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const eventData = extractHookData(hookEvent, payload);
  if (!eventData) return;

  const route = routeHookEvent(payload as HookPayload);
  if (!route) return;

  const logger = new ActivityLogger(route.repoRoot);
  await logger.append(route.taskId, eventData.event, eventData.data);
}

// --- CLI entry point ---

export async function hookCommand(hookEvent: string): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    const payload = JSON.parse(raw) as Record<string, unknown>;
    await processHookPayload(hookEvent, payload);
  } catch {
    // Hooks must never fail visibly
  }
}

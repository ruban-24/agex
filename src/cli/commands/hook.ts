import { ActivityLogger } from '../../core/activity-logger.js';
import { extractToolInput } from '../../core/transcript-parser.js';
import type { ActivityEventType } from '../../types.js';

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

export function routeHookEvent(payload: HookPayload): HookRoute | null {
  // Tier 1: AGEX_TASK_ID env var — authoritative ownership signal set by agex
  // when spawning the worker. Excludes coordinator/root sessions by construction.
  const envTaskId = process.env.AGEX_TASK_ID;
  const envWorktree = process.env.AGEX_WORKTREE;
  if (envTaskId && envWorktree) {
    const m = WORKTREE_RE.exec(envWorktree);
    if (m && m[1] === envTaskId) {
      return { repoRoot: envWorktree.slice(0, m.index), taskId: envTaskId };
    }
  }

  // Tier 2: tool_input path regex. Catches non-agex sessions that edit
  // worktree files by absolute path (e.g. a root-cwd Claude session).
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

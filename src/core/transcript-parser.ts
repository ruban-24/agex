import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { ActivityEvent, TokenUsage } from '../types.js';

// --- Tool input extraction ---

const TOOL_EXTRACTORS: Record<string, string[]> = {
  Edit: ['file_path'],
  Write: ['file_path'],
  Read: ['file_path', 'offset', 'limit'],
  Bash: ['command'],
  Grep: ['pattern', 'path', 'glob'],
  Glob: ['pattern', 'path'],
  Agent: ['description', 'subagent_type'],
  Task: ['description', 'subagent_type'],
  NotebookEdit: ['notebook_path'],
  Skill: ['skill'],
  WebSearch: ['query'],
  WebFetch: ['url'],
};

export function extractToolInput(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  // MCP tools → pass through all fields
  if (toolName.startsWith('mcp__')) {
    return { ...input };
  }

  const fields = TOOL_EXTRACTORS[toolName];
  if (fields) {
    const result: Record<string, unknown> = {};
    for (const f of fields) {
      if (f in input) {
        result[f] = input[f];
      }
    }
    return result;
  }

  // Unknown tool → return file_path if present, else empty
  if ('file_path' in input) {
    return { file_path: input.file_path };
  }
  return {};
}

// --- Transcript parsing ---

export interface TranscriptResult {
  events: ActivityEvent[];
  token_usage: TokenUsage;
  model?: string;
  turn_count: number;
  files_modified: string[];
}

function emptyTokenUsage(): TokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    api_call_count: 0,
  };
}

interface AssistantMessage {
  id: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  content?: Array<{
    type: string;
    name?: string;
    id?: string;
    input?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
}

interface TranscriptLine {
  type: string;
  timestamp?: string;
  message?: AssistantMessage & { content?: unknown };
  subtype?: string;
  durationMs?: number;
  messageCount?: number;
  cwd?: string;
}

export async function parseTranscript(
  transcriptPath: string,
  taskId: string,
): Promise<TranscriptResult> {
  const content = await readFile(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const events: ActivityEvent[] = [];
  const tokenUsage = emptyTokenUsage();
  const seenMessageIds = new Set<string>();
  const filesModified = new Set<string>();
  let model: string | undefined;
  let turnCount = 0;
  let lastCwd: string | undefined;

  for (const line of lines) {
    let entry: TranscriptLine;
    try {
      entry = JSON.parse(line);
    } catch {
      process.stderr.write(`[agex] warning: skipping malformed transcript line\n`);
      continue;
    }

    const ts = entry.timestamp ?? new Date().toISOString();

    if (entry.type === 'assistant' && entry.message) {
      const msg = entry.message as AssistantMessage;
      const msgId = msg.id;

      // Deduplicate by message.id
      if (msgId && seenMessageIds.has(msgId)) {
        continue;
      }
      if (msgId) {
        seenMessageIds.add(msgId);
      }

      // Model from first assistant message
      if (!model && msg.model) {
        model = msg.model;
        events.push({
          ts,
          event: 'session.start',
          task_id: taskId,
          data: { model },
        });
      }

      // Sum token usage
      const usage = msg.usage ?? {};
      tokenUsage.input_tokens += usage.input_tokens ?? 0;
      tokenUsage.output_tokens += usage.output_tokens ?? 0;
      tokenUsage.cache_creation_tokens += usage.cache_creation_input_tokens ?? 0;
      tokenUsage.cache_read_tokens += usage.cache_read_input_tokens ?? 0;
      tokenUsage.api_call_count += 1;

      // Extract tool calls
      const contentBlocks = (msg.content ?? []) as Array<{
        type: string;
        name?: string;
        id?: string;
        input?: Record<string, unknown>;
      }>;
      for (const block of contentBlocks) {
        if (block.type === 'tool_use' && block.name) {
          const extracted = extractToolInput(block.name, block.input ?? {});
          events.push({
            ts,
            event: 'tool.call',
            task_id: taskId,
            data: { tool: block.name, tool_use_id: block.id, ...extracted },
          });

          // Track files modified
          if (
            (block.name === 'Edit' || block.name === 'Write') &&
            block.input?.file_path &&
            typeof block.input.file_path === 'string'
          ) {
            filesModified.add(block.input.file_path);
          }
        }
      }
    } else if (entry.type === 'system' && entry.subtype === 'turn_duration') {
      turnCount += 1;
      events.push({
        ts,
        event: 'turn.end',
        task_id: taskId,
        data: {
          duration_ms: entry.durationMs,
          message_count: entry.messageCount,
        },
      });
    } else if (entry.type === 'user') {
      const cwd = entry.cwd;
      if (cwd && cwd !== lastCwd) {
        events.push({
          ts,
          event: 'cwd.changed',
          task_id: taskId,
          data: { cwd },
        });
        lastCwd = cwd;
      }
    }
  }

  // Parse subagents
  const transcriptDir = join(transcriptPath, '..');
  const subagentEvents = await parseSubagents(transcriptDir, taskId);
  events.push(...subagentEvents);

  return {
    events,
    token_usage: tokenUsage,
    model,
    turn_count: turnCount,
    files_modified: [...filesModified],
  };
}

// --- Subagent parsing ---

async function parseSubagents(
  transcriptDir: string,
  taskId: string,
): Promise<ActivityEvent[]> {
  const subagentsDir = join(transcriptDir, 'subagents');
  const events: ActivityEvent[] = [];

  let entries: string[];
  try {
    entries = await readdir(subagentsDir);
  } catch {
    return events;
  }

  for (const entry of entries) {
    const subDir = join(subagentsDir, entry);

    // Check for meta.json
    let meta: { description?: string; subagent_type?: string; started_at?: string } | undefined;
    try {
      const metaContent = await readFile(join(subDir, 'meta.json'), 'utf-8');
      meta = JSON.parse(metaContent);
    } catch {
      continue;
    }

    if (meta) {
      const ts = meta.started_at ?? new Date().toISOString();
      events.push({
        ts,
        event: 'subagent.started',
        task_id: taskId,
        data: {
          subagent_id: entry,
          description: meta.description,
          subagent_type: meta.subagent_type,
        },
      });
    }

    // Parse subagent transcript
    const subTranscriptPath = join(subDir, 'transcript.jsonl');
    try {
      const subResult = await parseTranscript(subTranscriptPath, taskId);
      let toolCount = 0;
      for (const ev of subResult.events) {
        if (ev.event === 'tool.call') toolCount++;
      }

      events.push({
        ts: meta?.started_at ?? new Date().toISOString(),
        event: 'subagent.completed',
        task_id: taskId,
        data: {
          subagent_id: entry,
          tool_count: toolCount,
          token_usage: subResult.token_usage,
        },
      });
    } catch {
      // Subagent transcript missing or unreadable — skip
    }
  }

  return events;
}

// --- Transcript discovery ---

export async function discoverTranscript(
  worktreePath: string,
): Promise<string | null> {
  const home = process.env.HOME ?? homedir();
  const projectsDir = join(home, '.claude', 'projects');

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return null;
  }

  // Claude Code sanitizes paths by replacing / with -
  // Scan all directories and find one that matches the worktree path
  const sanitized = worktreePath.replace(/\//g, '-');

  let matchDir: string | undefined;
  for (const dir of projectDirs) {
    // The sanitized directory name should match the worktree path
    // Claude uses the full absolute path, replacing / with -
    if (dir === sanitized) {
      matchDir = join(projectsDir, dir);
      break;
    }
  }

  if (!matchDir) {
    return null;
  }

  // Find the most recent .jsonl file
  let entries: string[];
  try {
    entries = await readdir(matchDir);
  } catch {
    return null;
  }

  const jsonlFiles: Array<{ path: string; mtime: number }> = [];
  for (const entry of entries) {
    if (entry.endsWith('.jsonl')) {
      const fullPath = join(matchDir, entry);
      try {
        const s = await stat(fullPath);
        jsonlFiles.push({ path: fullPath, mtime: s.mtimeMs });
      } catch {
        // skip
      }
    }
  }

  if (jsonlFiles.length === 0) {
    return null;
  }

  jsonlFiles.sort((a, b) => b.mtime - a.mtime);
  return jsonlFiles[0].path;
}

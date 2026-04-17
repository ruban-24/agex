// src/cli/format/activity.ts
import { blue, dim, green, red, yellow, purple, bold } from './colors.js';
import { sectionHeader } from './cards.js';
import { formatDuration } from './time.js';
import type { ActivityResult } from '../commands/activity.js';
import type { ActivityEvent } from '../../types.js';

// --- Color classification ---

const LIFECYCLE_EVENTS = new Set([
  'task.created', 'task.provisioned', 'task.exec.started', 'task.finished', 'cwd.changed',
]);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'Bash', 'NotebookEdit']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);
const SESSION_EVENTS = new Set(['session.start', 'turn.end', 'task.status_change']);

// --- Helpers ---

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS in local TZ
  } catch {
    return ts;
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function toolColor(tool: string): (s: string) => string {
  if (READ_TOOLS.has(tool)) return dim;
  if (WRITE_TOOLS.has(tool)) return yellow;
  if (AGENT_TOOLS.has(tool)) return purple;
  return dim;
}

function toolKeyDetail(data: Record<string, unknown>): string {
  const tool = data.tool as string;
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return (data.file_path as string) || '';
    case 'Bash':
      return (data.command as string) || '';
    case 'Grep':
      return `${data.pattern || ''}${data.path ? ` ${data.path}` : ''}`;
    case 'Glob':
      return `${data.pattern || ''}${data.path ? ` ${data.path}` : ''}`;
    case 'Agent':
      return (data.description as string) || '';
    case 'Task':
      return (data.description as string) || '';
    case 'Skill':
      return (data.skill as string) || '';
    case 'WebFetch':
      return (data.url as string) || '';
    case 'WebSearch':
      return (data.query as string) || '';
    default:
      return (data.file_path as string) || (data.command as string) || (data.description as string) || '';
  }
}

// --- Timeline renderers ---

function renderLifecycleEvent(event: ActivityEvent): string[] {
  const ts = dim(formatTimestamp(event.ts));
  const name = blue(`● ${event.event}`);
  const lines = [`${ts}  ${name}`];

  if (event.data) {
    for (const [key, value] of Object.entries(event.data)) {
      const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
      lines.push(`          ${dim(`${key}:`)} ${formatted}`);
    }
  }
  return lines;
}

function renderToolCall(event: ActivityEvent): string[] {
  const data = event.data || {};
  const tool = (data.tool as string) || 'unknown';
  const ts = dim(formatTimestamp(event.ts));
  const colorFn = toolColor(tool);
  const detail = toolKeyDetail(data);
  return [`${ts}  ${colorFn(padRight(tool, 20))}  ${detail}`];
}

function renderToolFailed(event: ActivityEvent): string[] {
  const data = event.data || {};
  const tool = (data.tool as string) || 'unknown';
  const error = (data.error as string) || 'unknown error';
  const detail = toolKeyDetail(data);
  const ts = dim(formatTimestamp(event.ts));
  const head = `${ts}  ${red('✗')} ${red(padRight(tool, 18))}`;
  return detail
    ? [`${head}  ${detail}  ${red(`(${error})`)}`]
    : [`${head}  ${red(error)}`];
}

function renderVerification(event: ActivityEvent): string[] {
  const data = event.data || {};
  const passed = data.passed as boolean;
  const summary = (data.summary as string) || '';
  const ts = dim(formatTimestamp(event.ts));
  const symbol = passed ? green('✓') : red('✗');
  const label = passed ? green('PASSED') : red('FAILED');
  const lines = [`${ts}  ${symbol} ${bold('verify')}  ${label}  ${dim(summary)}`];

  const checks = (data.checks as Array<{ cmd: string; passed: boolean; duration_s: number }>) || [];
  for (const check of checks) {
    const checkSym = check.passed ? green('✓') : red('✗');
    lines.push(`          ${checkSym} ${check.cmd}  ${dim(`(${check.duration_s}s)`)}`);
  }
  return lines;
}

function renderSessionEvent(event: ActivityEvent): string[] {
  const data = event.data || {};
  const ts = dim(formatTimestamp(event.ts));
  const pairs = Object.entries(data)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('  ');
  return [`${ts}  ${dim(`○ ${event.event}`)}  ${dim(pairs)}`];
}

function renderNeedsInput(event: ActivityEvent): string[] {
  const data = event.data || {};
  const ts = dim(formatTimestamp(event.ts));
  const question = (data.question as string) || '';
  return [`${ts}  ${yellow('? task.needs_input')}  ${question}`];
}

function renderSubagentEvent(event: ActivityEvent): string[] {
  const data = event.data || {};
  const ts = dim(formatTimestamp(event.ts));
  const detail = (data.description as string) || (data.type as string) || '';
  return [`${ts}  ${purple(`● ${event.event}`)}  ${detail}`];
}

function renderGeneric(event: ActivityEvent): string[] {
  const data = event.data || {};
  const ts = dim(formatTimestamp(event.ts));
  const pairs = Object.entries(data)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('  ');
  return [`${ts}  ${dim(`○ ${event.event}`)}  ${dim(pairs)}`];
}

function renderTimelineEvent(event: ActivityEvent): string[] {
  // session.end is rendered in footer, not timeline
  if (event.event === 'session.end') return [];

  if (LIFECYCLE_EVENTS.has(event.event)) return renderLifecycleEvent(event);
  if (event.event === 'tool.call') return renderToolCall(event);
  if (event.event === 'tool.failed') return renderToolFailed(event);
  if (event.event === 'task.verify') return renderVerification(event);
  if (event.event === 'task.needs_input') return renderNeedsInput(event);
  if (event.event === 'subagent.started' || event.event === 'subagent.completed') return renderSubagentEvent(event);
  if (SESSION_EVENTS.has(event.event)) return renderSessionEvent(event);
  if (event.event === 'task.answer') return renderSessionEvent(event);
  return renderGeneric(event);
}

// --- Header extraction ---

interface HeaderInfo {
  prompt?: string;
  branch?: string;
  model?: string;
  duration_s?: number;
  exit_code?: number;
  turns?: number;
  api_calls?: number;
  diff_stats?: { files_changed: number; insertions: number; deletions: number };
}

function extractHeader(events: ActivityEvent[]): HeaderInfo {
  const info: HeaderInfo = {};
  for (const event of events) {
    if (event.event === 'task.created' && event.data) {
      info.prompt = event.data.prompt as string;
      info.branch = event.data.branch as string;
    }
    if (event.event === 'session.start' && event.data) {
      info.model = event.data.model as string;
    }
    if (event.event === 'task.finished' && event.data) {
      info.duration_s = event.data.duration_s as number;
      info.exit_code = event.data.exit_code as number;
      if (event.data.diff_stats) {
        info.diff_stats = event.data.diff_stats as HeaderInfo['diff_stats'];
      }
    }
    if (event.event === 'session.end' && event.data) {
      info.turns = event.data.turns as number;
      info.api_calls = event.data.api_calls as number;
    }
  }
  return info;
}

// --- Footer extraction ---

interface FooterInfo {
  tokens?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  };
  api_calls?: number;
  turns?: number;
  files_modified?: string[];
}

function extractFooter(events: ActivityEvent[]): FooterInfo {
  const info: FooterInfo = {};
  for (const event of events) {
    if (event.event === 'session.end' && event.data) {
      if (event.data.tokens) {
        info.tokens = event.data.tokens as FooterInfo['tokens'];
      }
      info.api_calls = event.data.api_calls as number;
      info.turns = event.data.turns as number;
      if (event.data.files_modified) {
        info.files_modified = event.data.files_modified as string[];
      }
    }
  }
  return info;
}

// --- Main export ---

export function formatActivityHuman(result: ActivityResult): string {
  const lines: string[] = [];
  const header = extractHeader(result.events);
  const footer = extractFooter(result.events);

  // Header
  lines.push(bold(blue(`Task ${result.id}`)));
  if (header.prompt) lines.push(`  ${dim('prompt:')}   ${header.prompt}`);
  if (header.branch) lines.push(`  ${dim('branch:')}   ${header.branch}`);
  if (header.model) lines.push(`  ${dim('model:')}    ${header.model}`);
  if (header.duration_s !== undefined) lines.push(`  ${dim('duration:')} ${formatDuration(header.duration_s)}`);
  if (header.turns !== undefined) lines.push(`  ${dim('turns:')}    ${header.turns}`);
  if (header.api_calls !== undefined) lines.push(`  ${dim('api:')}      ${header.api_calls} calls`);
  lines.push('');

  // Timeline
  lines.push(sectionHeader('Timeline'));
  for (const event of result.events) {
    const rendered = renderTimelineEvent(event);
    lines.push(...rendered);
  }
  lines.push('');

  // Footer — token usage + files modified
  if (footer.tokens || footer.files_modified) {
    lines.push(sectionHeader('Usage'));
    if (footer.tokens) {
      lines.push(`  ${dim('input:')}    ${formatNumber(footer.tokens.input_tokens)} tokens`);
      lines.push(`  ${dim('output:')}   ${formatNumber(footer.tokens.output_tokens)} tokens`);
      if (footer.tokens.cache_read_tokens !== undefined) {
        lines.push(`  ${dim('cache read:')} ${formatNumber(footer.tokens.cache_read_tokens)} tokens`);
      }
      if (footer.tokens.cache_creation_tokens !== undefined) {
        lines.push(`  ${dim('cache write:')} ${formatNumber(footer.tokens.cache_creation_tokens)} tokens`);
      }
    }
    if (footer.files_modified && footer.files_modified.length > 0) {
      lines.push(`  ${dim('files modified:')}`);
      for (const file of footer.files_modified) {
        lines.push(`    ${file}`);
      }
    }
  }

  return lines.join('\n');
}

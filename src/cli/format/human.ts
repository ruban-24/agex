// src/cli/format/human.ts
import { blue, dim, green, red, bold } from './colors.js';
import { statusSymbol, statusColor, checkSymbol, diffStats, fileStatusIndicator } from './symbols.js';
import { formatDuration, formatRelativeTime } from './time.js';
import { card, cardColorForStatus, sectionHeader, summaryLine, nextAction } from './cards.js';
import type { TaskRecord, TaskStatus, VerificationCheck } from '../../types.js';
import type { CommitLogEntry, FileStats } from '../../core/reviewer.js';
import type { TaskStartResult } from '../commands/task-start.js';
import type { TaskStopResult } from '../commands/task-stop.js';

interface ServerAwareTask extends TaskRecord {
  port?: number;
  url?: string;
  server_running?: boolean;
}

// --- Helpers ---

function taskSortPriority(status: TaskStatus): number {
  const order: Record<TaskStatus, number> = {
    running: 0, verifying: 0, provisioning: 0,
    failed: 1, errored: 1,
    completed: 2, ready: 2,
    pending: 3,
    merged: 4, discarded: 5,
  };
  return order[status] ?? 3;
}

function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) => taskSortPriority(a.status) - taskSortPriority(b.status));
}

function statusCounts(tasks: TaskRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return counts;
}

function taskCardLine(task: ServerAwareTask): string {
  const sym = statusSymbol(task.status);
  const id = blue(task.id);
  const status = statusColor(task.status, task.status.padEnd(9));
  const duration = dim(formatDuration(task.duration_s));

  const parts = [sym, id, status, duration];

  if (task.verification && task.verification.checks.length > 0) {
    const passed = task.verification.checks.filter((c) => c.passed).length;
    const total = task.verification.checks.length;
    const checksText = `${passed}/${total}`;
    parts.push(task.verification.passed ? green(checksText) : red(checksText));
  }

  if (task.diff_stats && task.diff_stats.files_changed > 0) {
    parts.push(dim(`${diffStats(task.diff_stats.insertions, task.diff_stats.deletions)} · ${task.diff_stats.files_changed} files`));
  }

  if (task.server_running) {
    parts.push(dim(`srv :${task.port}`));
  }

  parts.push(task.prompt);
  return parts.join('  ');
}

function nextActionForStatus(id: string, status: TaskStatus): string | null {
  switch (status) {
    case 'completed': return `agentpod diff ${id} to review, agentpod merge ${id} to accept`;
    case 'failed': return `agentpod log ${id} to see output, agentpod verify ${id} to re-check`;
    case 'errored': return `agentpod log ${id} to see output`;
    case 'running': return `agentpod task status ${id} to check progress`;
    case 'ready': return `agentpod task exec ${id} --cmd "..." --wait`;
    default: return null;
  }
}

// --- List ---

export function formatListHuman(tasks: TaskRecord[]): string {
  if (tasks.length === 0) return 'No tasks.';

  const sorted = sortTasks(tasks);
  const counts = statusCounts(sorted);
  const lines: string[] = [];

  lines.push(summaryLine(sorted.length, counts));
  lines.push('');

  for (const task of sorted) {
    const color = cardColorForStatus(task.status);
    lines.push(card(color, [taskCardLine(task)]));
  }

  return lines.join('\n');
}

// --- Status ---

export function formatStatusHuman(task: ServerAwareTask, logContent: string): string {
  const color = cardColorForStatus(task.status);
  const lines: string[] = [];

  // Header card
  const headerLines = [
    `${statusSymbol(task.status)} ${bold(statusColor(task.status, task.status))}  ${bold(blue(task.id))}  ${dim(`(${formatDuration(task.duration_s)})`)}`,
    task.prompt,
  ];
  lines.push(card(color, headerLines));
  lines.push('');

  // Details section
  lines.push(sectionHeader('Details'));
  lines.push(`  ${dim('branch:')}   ${task.branch}`);
  if (task.cmd) lines.push(`  ${dim('cmd:')}      ${task.cmd}`);
  lines.push(`  ${dim('created:')}  ${formatRelativeTime(task.created_at)}`);
  if (task.duration_s !== undefined) lines.push(`  ${dim('duration:')} ${formatDuration(task.duration_s)}`);

  // Server section
  if (task.server_running != null) {
    if (task.server_running) {
      lines.push(`  ${dim('server:')}   ${green('▶')} running · http://localhost:${task.port} · pid ${task.server_pid}`);
    } else if (task.port) {
      lines.push(`  ${dim('server:')}   ${dim('○')} stopped · port ${task.port} available`);
    }
  }
  lines.push('');

  // Changes section
  if (task.diff_stats && task.diff_stats.files_changed > 0) {
    lines.push(sectionHeader('Changes'));
    lines.push(`  ${diffStats(task.diff_stats.insertions, task.diff_stats.deletions)} across ${task.diff_stats.files_changed} files`);
    lines.push('');
  }

  // Verification section
  if (task.verification && task.verification.checks.length > 0) {
    lines.push(sectionHeader('Verification'));
    for (const check of task.verification.checks) {
      lines.push(`  ${checkSymbol(check.passed)} ${check.cmd}  ${dim(`(${check.duration_s}s)`)}`);
      if (!check.passed && check.output) {
        const firstLine = check.output.trim().split('\n')[0];
        lines.push(`    ${red(firstLine)}`);
      }
    }
    lines.push('');
  }

  // Log tail section
  if (logContent && logContent.trim()) {
    const logLines = logContent.trim().split('\n');
    const tail = logLines.slice(-3);
    lines.push(sectionHeader('Log (last 3 lines)'));
    for (const l of tail) {
      lines.push(`  ${dim(l)}`);
    }
    lines.push('');
  }

  // Next action
  const hint = nextActionForStatus(task.id, task.status);
  if (hint) {
    lines.push(nextAction(hint));
  }

  return lines.join('\n');
}

// --- Summary ---

export function formatSummaryHuman(data: { total: number; completed: number; failed: number; running: number; ready: number; errored: number; tasks: TaskRecord[] }): string {
  const lines: string[] = [];
  const counts = statusCounts(data.tasks);

  lines.push(bold(`agentpod · ${data.total} tasks`));
  lines.push(summaryLine(data.total, counts));
  lines.push('');

  const sorted = sortTasks(data.tasks);
  for (const task of sorted) {
    const color = cardColorForStatus(task.status);
    lines.push(card(color, [taskCardLine(task)]));
  }

  return lines.join('\n');
}

// --- Diff ---

export function formatDiffHuman(data: { id: string; prompt: string; branch?: string; files_changed: number; insertions: number; deletions: number; commits: CommitLogEntry[]; files: FileStats[] }): string {
  const lines: string[] = [];

  lines.push(`${blue(data.id)} · ${data.prompt} · ${diffStats(data.insertions, data.deletions)} across ${data.files_changed} files · ${data.commits.length} commits`);
  lines.push('');

  if (data.commits.length > 0) {
    lines.push(sectionHeader('Commits'));
    for (const c of data.commits) {
      lines.push(`  ${dim(c.sha)} ${c.message}`);
    }
    lines.push('');
  }

  if (data.files.length > 0) {
    lines.push(sectionHeader('Files'));
    const maxLen = Math.max(...data.files.map((f) => f.file.length));
    for (const f of data.files) {
      const indicator = fileStatusIndicator(f.status);
      const name = f.file.padEnd(maxLen);
      const stats = diffStats(f.insertions, f.deletions);
      lines.push(`  ${indicator} ${name}  ${stats}`);
    }
    lines.push('');
  }

  lines.push(dim(`→ Full diff: git diff HEAD...${data.branch || `agentpod/${data.id}`}`));

  return lines.join('\n');
}

// --- Verify ---

export function formatVerifyHuman(data: { id: string; checks: VerificationCheck[] }): string {
  const lines: string[] = [];

  lines.push(`${blue(data.id)} · verification`);
  lines.push('');

  let totalDuration = 0;
  let failedCount = 0;

  for (const check of data.checks) {
    lines.push(`${checkSymbol(check.passed)} ${check.cmd}  ${dim(`(${check.duration_s}s)`)}`);
    if (!check.passed) {
      failedCount++;
      if (check.output) {
        const firstLine = check.output.trim().split('\n')[0];
        lines.push(`    ${red(firstLine)}`);
      }
    }
    totalDuration += check.duration_s;
  }

  lines.push('');
  if (failedCount === 0) {
    lines.push(green(bold(`All ${data.checks.length} checks passed`)) + dim(` (${totalDuration.toFixed(1)}s total)`));
  } else {
    lines.push(red(bold(`${failedCount} of ${data.checks.length} checks failed`)) + dim(` (${totalDuration.toFixed(1)}s total)`));
  }

  return lines.join('\n');
}

// --- Compare ---

export function formatCompareHuman(data: { tasks: Array<{ id: string; prompt: string; status: string; duration_s?: number; checks_passed?: number; checks_total?: number; files_changed: number; insertions?: number; deletions?: number }> }): string {
  const lines: string[] = [];

  const headers = ['ID', 'Status', 'Checks', 'Changes', 'Duration', 'Prompt'];
  const rows = data.tasks.map((t) => {
    const checksText = t.checks_total != null ? `${t.checks_passed}/${t.checks_total}` : '-';
    const changesText = `+${t.insertions ?? 0} -${t.deletions ?? 0}`;
    const durationText = t.duration_s != null ? formatDuration(t.duration_s) : '-';
    return [t.id, t.status, checksText, changesText, durationText, t.prompt.slice(0, 30)];
  });

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  const pad = (str: string, w: number) => str.padEnd(w);
  const sep = widths.map((w) => '\u2500'.repeat(w + 2)).join('\u2500\u2500');

  lines.push('  ' + headers.map((h, i) => pad(h, widths[i])).join('  '));
  lines.push('  ' + sep);

  for (const row of rows) {
    const id = blue(pad(row[0], widths[0]));
    const status = statusColor(row[1] as TaskStatus, pad(row[1], widths[1]));
    const checks = row[2] === '-' ? dim(pad(row[2], widths[2])) : pad(row[2], widths[2]);
    const changes = dim(pad(row[3], widths[3]));
    const duration = dim(pad(row[4], widths[4]));
    const prompt = row[5];
    lines.push(`  ${id}  ${status}  ${checks}  ${changes}  ${duration}  ${prompt}`);
  }

  lines.push('  ' + sep);

  const counts: Record<string, number> = {};
  for (const t of data.tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  lines.push('  ' + summaryLine(data.tasks.length, counts));

  return lines.join('\n');
}

// --- Action formatters ---

export function formatInitHuman(data: {
  created: boolean;
  files: string[];
  verify: string[];
  agents: string[];
}): string {
  const lines: string[] = [];
  const cardLines = [`${green('\u2713')} Initialized agentpod`];

  if (data.files.length > 0) {
    cardLines.push('');
    cardLines.push('Created:');
    for (const file of data.files) {
      cardLines.push(`  ${file}`);
    }
  }

  lines.push(card('green', cardLines));

  if (data.agents.length > 0) {
    lines.push(dim('  Try: "Use agentpod to try two different approaches to [your task]"'));
  } else {
    lines.push(nextAction('start your agent and give it a task'));
  }
  return lines.join('\n');
}

export function formatTaskCreateHuman(task: TaskRecord): string {
  const lines: string[] = [];
  lines.push(card('green', [
    `${green('\u2713')} Created task ${bold(blue(task.id))}`,
    task.prompt,
    dim(`branch: ${task.branch} \u00b7 worktree: ${task.worktree}`),
  ]));
  lines.push(nextAction(`agentpod task exec ${task.id} --cmd "..." --wait`));
  return lines.join('\n');
}

export function formatMergeHuman(data: { id: string; merged: boolean; strategy?: string; commit?: string; targetBranch?: string }): string {
  const lines: string[] = [];
  lines.push(card('green', [
    `${green('\u2713')} Merged ${bold(blue(data.id))} into ${data.targetBranch || 'current branch'}`,
    dim(`strategy: ${data.strategy || 'unknown'} \u00b7 commit: ${data.commit || 'unknown'}`),
  ]));
  lines.push(nextAction('agentpod clean'));
  return lines.join('\n');
}

export function formatDiscardHuman(task: TaskRecord): string {
  return card('dim', [`${dim('\u25CB')} Discarded ${blue(task.id)} \u2014 ${task.prompt}`]);
}

export function formatCleanHuman(data: { removed: string[]; kept: string[] }): string {
  if (data.removed.length === 0) {
    return card('dim', [`${dim('\u25CB')} Nothing to clean`]);
  }
  return card('green', [`${green('\u2713')} Cleaned ${data.removed.length} worktrees ${dim(`(${data.removed.join(', ')})`)}`]);
}

export function formatRunHuman(task: TaskRecord): string {
  if (task.status === 'completed' || task.status === 'failed') {
    const color = cardColorForStatus(task.status);
    const lines: string[] = [];
    const cardLines = [
      `${statusSymbol(task.status)} ${statusColor(task.status, task.status)}  ${bold(blue(task.id))}  ${dim(`(${formatDuration(task.duration_s)})`)}`,
      task.prompt,
    ];
    if (task.diff_stats && task.diff_stats.files_changed > 0) {
      const checks = task.verification ? `checks ${task.verification.checks.filter((c) => c.passed).length}/${task.verification.checks.length}` : '';
      cardLines.push(dim(`${diffStats(task.diff_stats.insertions, task.diff_stats.deletions)} \u00b7 ${task.diff_stats.files_changed} files \u00b7 ${checks}`));
    }
    lines.push(card(color, cardLines));

    const hint = nextActionForStatus(task.id, task.status);
    if (hint) lines.push(nextAction(hint));
    return lines.join('\n');
  }

  return formatTaskExecHuman(task);
}

export function formatTaskExecHuman(task: TaskRecord): string {
  if (task.status === 'completed' || task.status === 'failed') {
    return formatRunHuman(task);
  }

  const color = cardColorForStatus(task.status);
  const cardLines = [
    `${statusSymbol(task.status)} ${statusColor(task.status, task.status)}  ${blue(task.id)}`,
    task.prompt,
  ];
  if (task.pid) {
    cardLines.push(dim(`pid: ${task.pid}`));
  }
  const lines = [card(color, cardLines)];

  const hint = nextActionForStatus(task.id, task.status);
  if (hint) lines.push(nextAction(hint));
  return lines.join('\n');
}

export function formatTaskStartHuman(data: TaskStartResult): string {
  const lines: string[] = [];
  lines.push(card('green', [
    `${green('▶')} Server started on ${bold(data.url)} (pid ${data.server_pid})`,
  ]));
  if (data.warning) {
    lines.push(`  ${dim('⚠')} ${dim(data.warning)}`);
  }
  return lines.join('\n');
}

export function formatTaskStopHuman(data: TaskStopResult): string {
  return card('dim', [`${dim('○')} Server stopped`]);
}

export function formatErrorHuman(message: string): string {
  return `${red('error:')} ${message}`;
}

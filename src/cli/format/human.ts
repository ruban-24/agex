// src/cli/format/human.ts
import { blue, dim, green, red, yellow, bold } from './colors.js';
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
    'needs-input': 0,
    running: 0, verifying: 0, provisioning: 0,
    failed: 1, errored: 1,
    completed: 2, ready: 2,
    pending: 3,
    merged: 4, discarded: 5, retried: 5,
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
    const sym = task.verification.passed ? checkSymbol(true) : checkSymbol(false);
    const checksText = `${sym} ${passed}/${total}`;
    parts.push(task.verification.passed ? green(checksText) : red(checksText));
  }

  if (task.diff_stats && task.diff_stats.files_changed > 0) {
    parts.push(dim(`${diffStats(task.diff_stats.insertions, task.diff_stats.deletions)} · ${task.diff_stats.files_changed} files`));
  }

  if (task.server_running) {
    parts.push(dim(`srv :${task.port}`));
  }

  const truncatedPrompt = task.prompt.length > 40 ? task.prompt.slice(0, 37) + '...' : task.prompt;
  parts.push(truncatedPrompt);
  return parts.join('  ');
}

function nextActionForStatus(id: string, status: TaskStatus): string | null {
  switch (status) {
    case 'completed': return `agex review ${id} to review, agex accept ${id} to accept`;
    case 'failed': return `agex retry ${id} --feedback "..." to retry, agex output ${id} to see output`;
    case 'errored': return `agex retry ${id} --feedback "..." to retry, agex output ${id} to see output`;
    case 'needs-input': return `agex answer ${id} --text "..." to continue`;
    case 'running': return `agex status ${id} to check progress`;
    case 'ready': return `agex exec ${id} --cmd "..." --wait`;
    case 'retried': return null;
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
  if (task.issue) {
    lines.push(`  ${dim('issue:')}    #${task.issue.number} \u2014 ${task.issue.title} (${task.issue.url})`);
  }

  // Server section
  if (task.server_running != null) {
    if (task.server_running) {
      lines.push(`  ${dim('server:')}   ${green('▶')} running · http://localhost:${task.port} · pid ${task.server_pid}`);
    } else if (task.port) {
      lines.push(`  ${dim('server:')}   ${dim('○')} stopped · port ${task.port} available`);
    }
  }
  lines.push('');

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

  lines.push(bold(`agex · ${data.total} tasks`));
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

export function formatReviewHuman(data: { id: string; prompt: string; branch?: string; files_changed: number; insertions: number; deletions: number; commits: CommitLogEntry[]; files: FileStats[] }): string {
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

  lines.push(dim(`→ Full diff: git diff HEAD...${data.branch || `agex/${data.id}`}`));

  return lines.join('\n');
}

// --- Verify ---

export function formatVerifyHuman(data: { id: string; passed?: boolean; summary?: string; checks: VerificationCheck[] }): string {
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
  const cardLines = [`${green('\u2713')} Initialized agex`];

  if (data.files.length > 0) {
    cardLines.push('');
    cardLines.push('Created:');
    for (const file of data.files) {
      cardLines.push(`  ${file}`);
    }
  }

  lines.push(card('green', cardLines));

  if (data.agents.length > 0) {
    lines.push(dim('  Try: "Use agex to try two different approaches to [your task]"'));
  } else {
    lines.push(nextAction('start your agent and give it a task'));
  }
  return lines.join('\n');
}

export function formatTaskCreateHuman(task: TaskRecord): string {
  const lines: string[] = [];
  const cardLines = [
    `${green('\u2713')} Created task ${bold(blue(task.id))}`,
    task.prompt,
    dim(`branch: ${task.branch} \u00b7 worktree: ${task.worktree}`),
  ];
  if (task.issue) {
    cardLines.push(dim(`issue: #${task.issue.number} \u2014 ${task.issue.title}`));
  }
  lines.push(card('green', cardLines));
  lines.push(nextAction(`agex exec ${task.id} --cmd "..." --wait`));
  return lines.join('\n');
}

export function formatAcceptHuman(data: { id: string; merged: boolean; strategy?: string; commit?: string; targetBranch?: string; auto_committed?: boolean }): string {
  const lines: string[] = [];
  const cardLines = [
    `${green('\u2713')} Merged ${bold(blue(data.id))} into ${data.targetBranch || 'current branch'}`,
    dim(`strategy: ${data.strategy || 'unknown'} \u00b7 commit: ${data.commit || 'unknown'}`),
  ];
  if (data.auto_committed) {
    cardLines.push(dim('auto-committed uncommitted changes before merge'));
  }
  lines.push(card('green', cardLines));
  lines.push(nextAction('agex clean'));
  return lines.join('\n');
}

export function formatRejectHuman(task: TaskRecord & { uncommitted_changes?: boolean }): string {
  const line = `${dim('\u25CB')} Discarded ${blue(task.id)} \u2014 ${task.prompt}`;
  if (task.uncommitted_changes) {
    return card('dim', [line, dim('\u26a0 uncommitted changes were discarded')]);
  }
  return card('dim', [line]);
}

export function formatCleanHuman(data: { removed: string[]; kept: string[]; uncommitted_changes?: string[] }): string {
  if (data.removed.length === 0) {
    return card('dim', [`${dim('\u25CB')} Nothing to clean`]);
  }
  const lines = [`${green('\u2713')} Cleaned ${data.removed.length} worktrees ${dim(`(${data.removed.join(', ')})`)}`];
  if (data.uncommitted_changes?.length) {
    lines.push(dim(`\u26a0 uncommitted changes lost in: ${data.uncommitted_changes.join(', ')}`));
  }
  return card('green', lines);
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

export function formatAnswerHuman(task: TaskRecord): string {
  const color = cardColorForStatus(task.status);
  return card(color, [
    `${bold('Answer saved.')} Resuming task ${blue(task.id)}...`,
  ]);
}

export function formatErrorHuman(message: string, suggestion?: string): string {
  let output = `${red('✗')} ${message}`;
  if (suggestion) {
    output += '\n' + dim(`  → ${suggestion}`);
  }
  return output;
}

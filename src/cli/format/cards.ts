import { green, red, yellow, blue, purple, dim } from './colors.js';
import type { TaskStatus } from '../../types.js';

export type CardColor = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'dim';

const COLOR_FN: Record<CardColor, (s: string) => string> = {
  green, red, yellow, blue, purple, dim,
};

const STATUS_TO_CARD_COLOR: Record<TaskStatus, CardColor> = {
  running: 'yellow',
  completed: 'green',
  failed: 'red',
  errored: 'red',
  merged: 'purple',
  discarded: 'dim',
  ready: 'blue',
  pending: 'dim',
  verifying: 'yellow',
  provisioning: 'yellow',
  'needs-input': 'yellow',
  retried: 'dim',
};

export function cardColorForStatus(status: TaskStatus): CardColor {
  return STATUS_TO_CARD_COLOR[status];
}

export function card(color: CardColor, lines: string[]): string {
  const colorFn = COLOR_FN[color];
  return lines.map((line) => `${colorFn('┃')} ${line}`).join('\n');
}

export function sectionHeader(label: string): string {
  return dim(label.toUpperCase());
}

export function summaryLine(
  total: number,
  counts: Record<string, number>,
): string {
  const statusColors: Record<string, (s: string) => string> = {
    completed: green,
    running: yellow,
    failed: red,
    errored: red,
    merged: purple,
    ready: blue,
    pending: dim,
    discarded: dim,
    verifying: yellow,
    provisioning: yellow,
    'needs-input': yellow,
    retried: dim,
  };

  const parts: string[] = [];
  for (const [status, count] of Object.entries(counts)) {
    if (count > 0 && statusColors[status]) {
      parts.push(statusColors[status](`${count} ${status}`));
    }
  }

  return `${total} tasks · ${parts.join(' · ')}`;
}

export function nextAction(command: string): string {
  return `${yellow('→')} Next: ${command}`;
}

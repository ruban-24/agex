import { green, red, yellow, blue, purple, dim } from './colors.js';
import type { TaskStatus } from '../../types.js';

const SYMBOL_MAP: Record<TaskStatus, { symbol: string; color: (s: string) => string }> = {
  running:      { symbol: '▶', color: yellow },
  completed:    { symbol: '✓', color: green },
  failed:       { symbol: '✗', color: red },
  errored:      { symbol: '✗', color: red },
  merged:       { symbol: '◆', color: purple },
  discarded:    { symbol: '○', color: dim },
  ready:        { symbol: '●', color: blue },
  pending:      { symbol: '○', color: dim },
  verifying:    { symbol: '▶', color: yellow },
  provisioning: { symbol: '▶', color: yellow },
  'needs-input':  { symbol: '?', color: yellow },
  retried:        { symbol: '↻', color: dim },
};

export function statusSymbol(status: TaskStatus): string {
  const entry = SYMBOL_MAP[status];
  return entry.color(entry.symbol);
}

export function statusColor(status: TaskStatus, text: string): string {
  return SYMBOL_MAP[status].color(text);
}

export function checkSymbol(passed: boolean): string {
  return passed ? green('✓') : red('✗');
}

export function diffStats(insertions: number, deletions: number): string {
  return `${green(`+${insertions}`)} ${red(`-${deletions}`)}`;
}

export function fileStatusIndicator(status: string): string {
  switch (status) {
    case 'A': return green('A');
    case 'D': return red('D');
    case 'M': return yellow('M');
    default: return dim(status);
  }
}

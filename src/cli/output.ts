import { stripAnsi, isTTY } from './format/colors.js';

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

export function humanOutput(formatted: string): string {
  if (isTTY()) return formatted;
  return stripAnsi(formatted);
}

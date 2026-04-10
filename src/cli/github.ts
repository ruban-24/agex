import { execaCommand } from 'execa';
import { AgexError } from '../errors.js';
import { EXIT_CODES } from '../constants.js';

export interface ParsedIssueRef {
  number: number;
  repo?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  body: string;
  labels: string[];
  comments: Array<{
    author: string;
    body: string;
    createdAt: string;
  }>;
}

export function parseIssueRef(ref: string): ParsedIssueRef {
  // Bare number: "45"
  if (/^\d+$/.test(ref)) {
    return { number: parseInt(ref, 10) };
  }

  // Full URL: "https://github.com/owner/repo/issues/45"
  const urlMatch = ref.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (urlMatch) {
    return { number: parseInt(urlMatch[2], 10), repo: urlMatch[1] };
  }

  // owner/repo#N: "owner/repo#45"
  const refMatch = ref.match(/^([^/]+\/[^#]+)#(\d+)$/);
  if (refMatch) {
    return { number: parseInt(refMatch[2], 10), repo: refMatch[1] };
  }

  throw new AgexError(`Invalid issue reference: '${ref}'`, {
    suggestion: "Use a number (45), URL (https://github.com/owner/repo/issues/45), or owner/repo#45",
    exitCode: EXIT_CODES.INVALID_ARGS,
  });
}

export async function fetchGitHubIssue(ref: ParsedIssueRef): Promise<GitHubIssue> {
  const args = [
    'issue', 'view', String(ref.number),
    '--json', 'number,title,url,body,labels,comments',
  ];
  if (ref.repo) {
    args.push('--repo', ref.repo);
  }

  let result;
  try {
    result = await execaCommand(`gh ${args.join(' ')}`, { shell: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as Record<string, unknown>)?.stderr as string || '';

    // gh not installed
    if (message.includes('ENOENT') || message.includes('not found')) {
      throw new AgexError('GitHub CLI (gh) is not installed', {
        suggestion: 'Install it from https://cli.github.com',
        exitCode: EXIT_CODES.INVALID_ARGS,
      });
    }

    // Auth failure
    if (stderr.includes('auth login') || stderr.includes('not logged')) {
      throw new AgexError('GitHub CLI is not authenticated', {
        suggestion: "Run 'gh auth login' to authenticate",
        exitCode: EXIT_CODES.INVALID_ARGS,
      });
    }

    // Issue not found or other error
    throw new AgexError(`Failed to fetch issue #${ref.number}: ${stderr || message}`, {
      suggestion: "Check the issue number. Run 'gh issue list' to see open issues",
      exitCode: EXIT_CODES.INVALID_ARGS,
    });
  }

  const data = JSON.parse(result.stdout);

  return {
    number: data.number,
    title: data.title,
    url: data.url,
    body: data.body || '',
    labels: (data.labels || []).map((l: { name: string }) => l.name),
    comments: (data.comments || []).map((c: { author: { login: string }; body: string; createdAt: string }) => ({
      author: c.author.login,
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
}

export function buildIssuePrompt(issue: GitHubIssue): string {
  const parts: string[] = [];

  parts.push(`# GitHub Issue #${issue.number}: ${issue.title}\n`);
  parts.push(issue.body);

  if (issue.labels.length > 0) {
    parts.push(`\n## Labels\n${issue.labels.join(', ')}`);
  }

  if (issue.comments.length > 0) {
    parts.push('\n## Comments');
    for (const c of issue.comments) {
      parts.push(`\n### @${c.author} (${c.createdAt.split('T')[0]}):\n${c.body}`);
    }
  }

  return parts.join('\n');
}

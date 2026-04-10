import { describe, it, expect } from 'vitest';
import { parseIssueRef, buildIssuePrompt, type GitHubIssue } from '../../src/cli/github.js';

describe('parseIssueRef', () => {
  it('parses bare number', () => {
    const result = parseIssueRef('45');
    expect(result).toEqual({ number: 45 });
  });

  it('parses full URL', () => {
    const result = parseIssueRef('https://github.com/owner/repo/issues/45');
    expect(result).toEqual({ number: 45, repo: 'owner/repo' });
  });

  it('parses owner/repo#N format', () => {
    const result = parseIssueRef('owner/repo#45');
    expect(result).toEqual({ number: 45, repo: 'owner/repo' });
  });

  it('throws on invalid input', () => {
    expect(() => parseIssueRef('not-a-ref')).toThrow();
  });
});

describe('buildIssuePrompt', () => {
  it('builds prompt from issue metadata', () => {
    const issue: GitHubIssue = {
      number: 45,
      title: 'Fix login timeout',
      url: 'https://github.com/owner/repo/issues/45',
      body: 'The login page times out after 30s.',
      labels: ['bug', 'auth'],
      comments: [
        { author: 'alice', body: 'Reproduces on Safari too', createdAt: '2026-04-01T00:00:00Z' },
      ],
    };

    const prompt = buildIssuePrompt(issue);

    expect(prompt).toContain('# GitHub Issue #45: Fix login timeout');
    expect(prompt).toContain('The login page times out after 30s.');
    expect(prompt).toContain('bug, auth');
    expect(prompt).toContain('@alice');
    expect(prompt).toContain('Reproduces on Safari too');
  });

  it('omits labels section when no labels', () => {
    const issue: GitHubIssue = {
      number: 1,
      title: 'Test',
      url: 'https://github.com/o/r/issues/1',
      body: 'body',
      labels: [],
      comments: [],
    };

    const prompt = buildIssuePrompt(issue);
    expect(prompt).not.toContain('## Labels');
  });

  it('omits comments section when no comments', () => {
    const issue: GitHubIssue = {
      number: 1,
      title: 'Test',
      url: 'https://github.com/o/r/issues/1',
      body: 'body',
      labels: [],
      comments: [],
    };

    const prompt = buildIssuePrompt(issue);
    expect(prompt).not.toContain('## Comments');
  });
});

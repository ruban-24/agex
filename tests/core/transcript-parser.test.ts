import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractToolInput,
  parseTranscript,
  discoverTranscript,
  type TranscriptResult,
} from '../../src/core/transcript-parser.js';

// Helper to build a JSONL transcript line
function jsonl(...lines: unknown[]): string {
  return lines.map(l => JSON.stringify(l)).join('\n') + '\n';
}

function assistantMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'assistant',
    timestamp: '2026-04-17T10:00:00Z',
    message: {
      id: 'msg_001',
      model: 'claude-opus-4-20260401',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
      },
      content: [],
      ...((overrides.message as Record<string, unknown>) ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'message')),
  };
}

describe('extractToolInput', () => {
  it('Edit → { file_path } only', () => {
    const result = extractToolInput('Edit', {
      file_path: '/src/main.ts',
      old_string: 'foo',
      new_string: 'bar',
    });
    expect(result).toEqual({ file_path: '/src/main.ts' });
  });

  it('Write → { file_path } only', () => {
    const result = extractToolInput('Write', {
      file_path: '/src/main.ts',
      content: 'hello world',
    });
    expect(result).toEqual({ file_path: '/src/main.ts' });
  });

  it('Read → { file_path, offset, limit }', () => {
    const result = extractToolInput('Read', {
      file_path: '/src/main.ts',
      offset: 10,
      limit: 50,
    });
    expect(result).toEqual({ file_path: '/src/main.ts', offset: 10, limit: 50 });
  });

  it('Read → omits missing optional fields', () => {
    const result = extractToolInput('Read', {
      file_path: '/src/main.ts',
    });
    expect(result).toEqual({ file_path: '/src/main.ts' });
  });

  it('Bash → { command } only', () => {
    const result = extractToolInput('Bash', {
      command: 'npm test',
      timeout: 30000,
      description: 'run tests',
    });
    expect(result).toEqual({ command: 'npm test' });
  });

  it('Grep → { pattern, path, glob }', () => {
    const result = extractToolInput('Grep', {
      pattern: 'TODO',
      path: '/src',
      glob: '*.ts',
      output_mode: 'content',
    });
    expect(result).toEqual({ pattern: 'TODO', path: '/src', glob: '*.ts' });
  });

  it('Glob → { pattern, path }', () => {
    const result = extractToolInput('Glob', {
      pattern: '**/*.ts',
      path: '/src',
    });
    expect(result).toEqual({ pattern: '**/*.ts', path: '/src' });
  });

  it('Agent → { description, subagent_type }', () => {
    const result = extractToolInput('Agent', {
      description: 'Search for patterns',
      subagent_type: 'search',
      prompt: 'Find all usages of foo',
    });
    expect(result).toEqual({ description: 'Search for patterns', subagent_type: 'search' });
  });

  it('Skill → { skill }', () => {
    const result = extractToolInput('Skill', {
      skill: 'commit',
      args: '-m "fix"',
    });
    expect(result).toEqual({ skill: 'commit' });
  });

  it('WebSearch → { query }', () => {
    const result = extractToolInput('WebSearch', {
      query: 'vitest mock fs',
      max_results: 5,
    });
    expect(result).toEqual({ query: 'vitest mock fs' });
  });

  it('WebFetch → { url }', () => {
    const result = extractToolInput('WebFetch', {
      url: 'https://example.com',
      headers: { 'Accept': 'text/html' },
    });
    expect(result).toEqual({ url: 'https://example.com' });
  });

  it('MCP tools (mcp__*) → all input fields', () => {
    const input = {
      owner: 'acme',
      repo: 'app',
      path: 'README.md',
    };
    const result = extractToolInput('mcp__github__get_file_contents', input);
    expect(result).toEqual(input);
  });

  it('NotebookEdit → { notebook_path }', () => {
    const result = extractToolInput('NotebookEdit', {
      notebook_path: '/notebooks/analysis.ipynb',
      cell_index: 3,
      new_source: 'print("hello")',
    });
    expect(result).toEqual({ notebook_path: '/notebooks/analysis.ipynb' });
  });

  it('Unknown tools with file_path → { file_path }', () => {
    const result = extractToolInput('SomeFutureTool', {
      file_path: '/src/foo.ts',
      extra: 'data',
    });
    expect(result).toEqual({ file_path: '/src/foo.ts' });
  });

  it('Unknown tools without file_path → {}', () => {
    const result = extractToolInput('SomeFutureTool', {
      extra: 'data',
      other: 123,
    });
    expect(result).toEqual({});
  });
});

describe('parseTranscript', () => {
  let tempDir: string;
  let transcriptPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-transcript-test-'));
    transcriptPath = join(tempDir, 'transcript.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('extracts model from first assistant message → session.start event', async () => {
    await writeFile(transcriptPath, jsonl(
      assistantMessage(),
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    expect(result.model).toBe('claude-opus-4-20260401');
    expect(result.events.some(e => e.event === 'session.start')).toBe(true);

    const startEvent = result.events.find(e => e.event === 'session.start')!;
    expect(startEvent.data?.model).toBe('claude-opus-4-20260401');
    expect(startEvent.task_id).toBe('task1');
  });

  it('sums token usage across all assistant messages', async () => {
    await writeFile(transcriptPath, jsonl(
      assistantMessage(),
      assistantMessage({
        message: {
          id: 'msg_002',
          model: 'claude-opus-4-20260401',
          usage: {
            input_tokens: 200,
            output_tokens: 100,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 40,
          },
          content: [],
        },
      }),
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    expect(result.token_usage.input_tokens).toBe(300);
    expect(result.token_usage.output_tokens).toBe(150);
    expect(result.token_usage.cache_creation_tokens).toBe(30);
    expect(result.token_usage.cache_read_tokens).toBe(70);
    expect(result.token_usage.api_call_count).toBe(2);
  });

  it('extracts tool calls from message.content[type=tool_use] blocks', async () => {
    await writeFile(transcriptPath, jsonl(
      assistantMessage({
        message: {
          id: 'msg_001',
          model: 'claude-opus-4-20260401',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            { type: 'text', text: 'Let me read the file.' },
            {
              type: 'tool_use',
              id: 'tu_001',
              name: 'Read',
              input: { file_path: '/src/main.ts' },
            },
          ],
        },
      }),
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    const toolEvent = result.events.find(e => e.event === 'tool.call');
    expect(toolEvent).toBeDefined();
    expect(toolEvent!.data?.tool).toBe('Read');
    expect(toolEvent!.data?.tool_use_id).toBe('tu_001');
    expect(toolEvent!.data?.file_path).toBe('/src/main.ts');
  });

  it('tracks files modified by Edit and Write tools (deduplicates)', async () => {
    await writeFile(transcriptPath, jsonl(
      assistantMessage({
        message: {
          id: 'msg_001',
          model: 'claude-opus-4-20260401',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            {
              type: 'tool_use',
              id: 'tu_001',
              name: 'Edit',
              input: { file_path: '/src/main.ts', old_string: 'a', new_string: 'b' },
            },
            {
              type: 'tool_use',
              id: 'tu_002',
              name: 'Write',
              input: { file_path: '/src/utils.ts', content: 'hello' },
            },
            {
              type: 'tool_use',
              id: 'tu_003',
              name: 'Edit',
              input: { file_path: '/src/main.ts', old_string: 'c', new_string: 'd' },
            },
          ],
        },
      }),
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    expect(result.files_modified).toEqual(['/src/main.ts', '/src/utils.ts']);
  });

  it('deduplicates assistant messages by message.id', async () => {
    // Same message ID appears twice (streaming artifact)
    await writeFile(transcriptPath, jsonl(
      assistantMessage(),
      assistantMessage(), // duplicate msg_001
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    // Should only count tokens once
    expect(result.token_usage.input_tokens).toBe(100);
    expect(result.token_usage.output_tokens).toBe(50);
    expect(result.token_usage.api_call_count).toBe(1);
  });

  it('extracts turn.end from system entries with subtype turn_duration', async () => {
    await writeFile(transcriptPath, jsonl(
      assistantMessage(),
      {
        type: 'system',
        timestamp: '2026-04-17T10:01:00Z',
        subtype: 'turn_duration',
        durationMs: 5000,
        messageCount: 3,
      },
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    expect(result.turn_count).toBe(1);

    const turnEvent = result.events.find(e => e.event === 'turn.end');
    expect(turnEvent).toBeDefined();
    expect(turnEvent!.data?.duration_ms).toBe(5000);
    expect(turnEvent!.data?.message_count).toBe(3);
  });

  it('skips malformed JSON lines gracefully (warns to stderr)', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await writeFile(transcriptPath, jsonl(
      assistantMessage(),
    ).trimEnd() + '\nNOT VALID JSON\n');

    const result = await parseTranscript(transcriptPath, 'task1');
    // Should still get the valid assistant message
    expect(result.model).toBe('claude-opus-4-20260401');
    expect(result.token_usage.api_call_count).toBe(1);

    // Should have warned
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('handles missing usage fields (defaults to 0)', async () => {
    await writeFile(transcriptPath, jsonl(
      {
        type: 'assistant',
        timestamp: '2026-04-17T10:00:00Z',
        message: {
          id: 'msg_001',
          model: 'claude-opus-4-20260401',
          usage: {},
          content: [],
        },
      },
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    expect(result.token_usage.input_tokens).toBe(0);
    expect(result.token_usage.output_tokens).toBe(0);
    expect(result.token_usage.cache_creation_tokens).toBe(0);
    expect(result.token_usage.cache_read_tokens).toBe(0);
    expect(result.token_usage.api_call_count).toBe(1);
  });

  it('emits cwd.changed events from user messages', async () => {
    await writeFile(transcriptPath, jsonl(
      { type: 'user', timestamp: '2026-04-17T10:00:00Z', message: { content: 'hello' }, cwd: '/project' },
      assistantMessage(),
      { type: 'user', timestamp: '2026-04-17T10:01:00Z', message: { content: 'next' }, cwd: '/project/src' },
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    const cwdEvents = result.events.filter(e => e.event === 'cwd.changed');
    // First cwd is initial, second is a change
    expect(cwdEvents.length).toBeGreaterThanOrEqual(1);
    expect(cwdEvents.some(e => e.data?.cwd === '/project/src')).toBe(true);
  });
});

describe('parseTranscript — subagents', () => {
  let tempDir: string;
  let transcriptPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agex-transcript-sub-'));
    transcriptPath = join(tempDir, 'transcript.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('parses subagent meta files in subagents/ directory → subagent.started events', async () => {
    // Create main transcript
    await writeFile(transcriptPath, jsonl(assistantMessage()));

    // Create subagents directory with meta file
    const subagentsDir = join(tempDir, 'subagents');
    await mkdir(subagentsDir, { recursive: true });
    const subagentDir = join(subagentsDir, 'sub_001');
    await mkdir(subagentDir, { recursive: true });

    // Meta file
    await writeFile(join(subagentDir, 'meta.json'), JSON.stringify({
      description: 'Search for patterns',
      subagent_type: 'search',
      started_at: '2026-04-17T10:00:30Z',
    }));

    // Subagent transcript
    await writeFile(join(subagentDir, 'transcript.jsonl'), jsonl(
      assistantMessage({
        message: {
          id: 'sub_msg_001',
          model: 'claude-opus-4-20260401',
          usage: { input_tokens: 50, output_tokens: 25 },
          content: [
            { type: 'tool_use', id: 'tu_sub_001', name: 'Grep', input: { pattern: 'foo', path: '/src' } },
          ],
        },
      }),
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    const startedEvent = result.events.find(e => e.event === 'subagent.started');
    expect(startedEvent).toBeDefined();
    expect(startedEvent!.data?.description).toBe('Search for patterns');
  });

  it('parses subagent transcript recursively → subagent.completed events with tool count and token usage', async () => {
    // Create main transcript
    await writeFile(transcriptPath, jsonl(assistantMessage()));

    // Create subagents directory
    const subagentsDir = join(tempDir, 'subagents');
    await mkdir(subagentsDir, { recursive: true });
    const subagentDir = join(subagentsDir, 'sub_001');
    await mkdir(subagentDir, { recursive: true });

    await writeFile(join(subagentDir, 'meta.json'), JSON.stringify({
      description: 'Search for patterns',
      subagent_type: 'search',
      started_at: '2026-04-17T10:00:30Z',
    }));

    await writeFile(join(subagentDir, 'transcript.jsonl'), jsonl(
      assistantMessage({
        message: {
          id: 'sub_msg_001',
          model: 'claude-opus-4-20260401',
          usage: { input_tokens: 50, output_tokens: 25, cache_creation_input_tokens: 5, cache_read_input_tokens: 10 },
          content: [
            { type: 'tool_use', id: 'tu_sub_001', name: 'Grep', input: { pattern: 'foo', path: '/src' } },
            { type: 'tool_use', id: 'tu_sub_002', name: 'Read', input: { file_path: '/src/main.ts' } },
          ],
        },
      }),
    ));

    const result = await parseTranscript(transcriptPath, 'task1');
    const completedEvent = result.events.find(e => e.event === 'subagent.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.data?.tool_count).toBe(2);
    expect(completedEvent!.data?.token_usage).toEqual({
      input_tokens: 50,
      output_tokens: 25,
      cache_creation_tokens: 5,
      cache_read_tokens: 10,
      api_call_count: 1,
    });
  });
});

describe('discoverTranscript', () => {
  let tempHome: string;
  let originalHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'agex-discover-'));
    originalHome = process.env.HOME!;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it('returns null when ~/.claude/projects/ does not exist', async () => {
    const result = await discoverTranscript('/some/worktree/path');
    expect(result).toBeNull();
  });

  it('returns null when no matching project directory is found', async () => {
    const projectsDir = join(tempHome, '.claude', 'projects');
    await mkdir(projectsDir, { recursive: true });
    await mkdir(join(projectsDir, '-some-other-project'));

    const result = await discoverTranscript('/my/worktree/path');
    expect(result).toBeNull();
  });

  it('finds the most recent .jsonl file in matching project directory', async () => {
    const worktreePath = '/Users/ruban/projects/my-app';
    const projectsDir = join(tempHome, '.claude', 'projects');
    const sanitized = '-Users-ruban-projects-my-app';
    const projectDir = join(projectsDir, sanitized);
    await mkdir(projectDir, { recursive: true });

    // Create two JSONL files, second should be returned (most recent)
    await writeFile(join(projectDir, 'old.jsonl'), 'old data\n');
    // Ensure different mtime
    await new Promise(r => setTimeout(r, 50));
    await writeFile(join(projectDir, 'new.jsonl'), 'new data\n');

    const result = await discoverTranscript(worktreePath);
    expect(result).toBe(join(projectDir, 'new.jsonl'));
  });
});

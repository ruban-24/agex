import { appendFile, readFile, access } from 'node:fs/promises';
import { taskActivityPath } from '../constants.js';
import type { ActivityEvent, ActivityEventType, TokenUsage } from '../types.js';

export class ActivityLogger {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async append(taskId: string, event: ActivityEventType, data?: Record<string, unknown>): Promise<void> {
    const entry: ActivityEvent = {
      ts: new Date().toISOString(),
      event,
      task_id: taskId,
      ...(data !== undefined && { data }),
    };
    const filePath = taskActivityPath(this.repoRoot, taskId);
    await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  async read(taskId: string): Promise<ActivityEvent[]> {
    const filePath = taskActivityPath(this.repoRoot, taskId);
    try {
      const content = await readFile(filePath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line) as ActivityEvent;
          } catch {
            return null;
          }
        })
        .filter((e): e is ActivityEvent => e !== null);
    } catch {
      return [];
    }
  }

  async exists(taskId: string): Promise<boolean> {
    try {
      await access(taskActivityPath(this.repoRoot, taskId));
      return true;
    } catch {
      return false;
    }
  }

  async hasToolCalls(taskId: string): Promise<boolean> {
    const events = await this.read(taskId);
    return events.some(e => e.event === 'tool.call');
  }

  async aggregate(taskId: string): Promise<{
    token_usage?: TokenUsage;
    model?: string;
    turn_count?: number;
    files_modified?: string[];
  } | null> {
    const events = await this.read(taskId);
    if (events.length === 0) return null;

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let apiCalls = 0;
    let model: string | undefined;
    let turnCount = 0;
    const filesModified = new Set<string>();

    for (const event of events) {
      if (event.event === 'session.start' && event.data?.model) {
        model = event.data.model as string;
      }
      if (event.event === 'session.end' && event.data?.tokens) {
        const tokens = event.data.tokens as Record<string, number>;
        inputTokens += tokens.input_tokens || 0;
        outputTokens += tokens.output_tokens || 0;
        cacheCreationTokens += tokens.cache_creation_tokens || 0;
        cacheReadTokens += tokens.cache_read_tokens || 0;
        apiCalls += (event.data.api_calls as number) || 0;
      }
      if (event.event === 'turn.end') {
        turnCount++;
      }
      if (event.event === 'tool.call') {
        const tool = event.data?.tool as string;
        if (['Edit', 'Write'].includes(tool) && event.data?.file_path) {
          filesModified.add(event.data.file_path as string);
        }
      }
    }

    const hasTokenData = inputTokens > 0 || outputTokens > 0;
    return {
      ...(hasTokenData && {
        token_usage: { input_tokens: inputTokens, output_tokens: outputTokens, cache_creation_tokens: cacheCreationTokens, cache_read_tokens: cacheReadTokens, api_call_count: apiCalls },
      }),
      model,
      ...(turnCount > 0 && { turn_count: turnCount }),
      ...(filesModified.size > 0 && { files_modified: [...filesModified] }),
    };
  }
}

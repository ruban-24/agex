import { TaskManager } from '../../core/task-manager.js';
import { WorkspaceManager } from '../../core/workspace-manager.js';
import { loadConfig } from '../../config/loader.js';
import { ActivityLogger } from '../../core/activity-logger.js';
import { AgexError } from '../../errors.js';
import { EXIT_CODES } from '../../constants.js';
import type { TaskRecord, AgexConfig } from '../../types.js';
import { parseIssueRef, fetchGitHubIssue, buildIssuePrompt } from '../github.js';

export interface TaskCreateOptions {
  prompt?: string;
  cmd?: string;
  issue?: string;
}

export async function taskCreateCommand(
  repoRoot: string,
  options: TaskCreateOptions,
  preloadedConfig?: AgexConfig,
): Promise<TaskRecord> {
  const config = preloadedConfig ?? await loadConfig(repoRoot);
  const tm = new TaskManager(repoRoot);
  const wm = new WorkspaceManager(repoRoot);

  // Resolve prompt from --issue and/or --prompt
  let prompt = options.prompt || '';
  let issueMetadata: TaskRecord['issue'] | undefined;

  if (options.issue) {
    const ref = parseIssueRef(options.issue);
    const issue = await fetchGitHubIssue(ref);
    const issuePrompt = buildIssuePrompt(issue);

    prompt = options.prompt
      ? `${issuePrompt}\n\n## Additional Instructions\n${options.prompt}`
      : issuePrompt;

    issueMetadata = {
      number: issue.number,
      url: issue.url,
      title: issue.title,
    };
  }

  if (!prompt) {
    throw new AgexError('No prompt provided', {
      suggestion: "Provide --prompt or --issue to create a task",
      exitCode: EXIT_CODES.INVALID_ARGS,
    });
  }

  // Create task record
  const task = await tm.createTask({ prompt, cmd: options.cmd });

  const activity = new ActivityLogger(repoRoot);
  try { await activity.append(task.id, 'task.created', { prompt, branch: task.branch, worktree: task.worktree }); } catch { /* best-effort */ }

  if (issueMetadata) {
    await tm.updateTask(task.id, { issue: issueMetadata });
  }

  await tm.updateStatus(task.id, 'provisioning');

  try {
    // Create worktree
    await wm.createWorktree(task.id, task.branch);

    // Provision
    await wm.provision(task.id, {
      copy: config.copy,
      symlink: config.symlink,
    });

    try { await activity.append(task.id, 'task.provisioned', { copies: config.copy, symlinks: config.symlink, setup_commands: config.setup }); } catch { /* best-effort */ }

    // Run setup hooks
    if (config.setup && config.setup.length > 0) {
      await wm.runSetupHooks(task.id, config.setup);
    }

    // Mark ready
    const readyTask = await tm.updateStatus(task.id, 'ready');
    return readyTask;
  } catch (err: unknown) {
    // Rollback: clean up whatever was created
    await wm.safeRemoveWorktree(task.id);
    await wm.safeDeleteBranch(task.branch);
    try { await tm.deleteTask(task.id); } catch { /* task may not exist yet */ }

    // Re-throw with suggestion
    const message = err instanceof Error ? err.message : String(err);
    throw new AgexError(`Task provisioning failed: ${message}`, {
      suggestion: "Check setup hooks in .agex/config.yml. Run 'agex init' to reconfigure",
      exitCode: EXIT_CODES.WORKSPACE_ERROR,
    });
  }
}

import simpleGit from 'simple-git';
import type { DiffStats } from '../types.js';

export interface CommitLogEntry {
  sha: string;
  message: string;
}

export interface FileStats {
  file: string;
  insertions: number;
  deletions: number;
  status: string; // A, M, D, R, etc.
}

export interface ReviewData {
  stats: DiffStats;
  commits: CommitLogEntry[];
  files: FileStats[];
  diff?: string;
}

export class Reviewer {
  private repoRoot: string;
  private git: ReturnType<typeof simpleGit>;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.git = simpleGit(repoRoot);
  }

  private async getMergeBase(branch: string): Promise<string> {
    const base = await this.git.raw(['merge-base', 'HEAD', branch]);
    return base.trim();
  }

  /**
   * Collect all review data in one call — single merge-base, parallel git ops.
   * Pass includePatch=false to skip the full diff text (e.g. for --human output).
   */
  async collectReview(branch: string, opts?: { includePatch?: boolean }): Promise<ReviewData> {
    const baseSha = await this.getMergeBase(branch);
    const includePatch = opts?.includePatch ?? true;

    // Run all independent git operations in parallel
    const [numstat, nameStatus, logOutput, diffText] = await Promise.all([
      this.git.raw(['diff', '--numstat', baseSha, branch]).catch(() => ''),
      this.git.raw(['diff', '--name-status', baseSha, branch]).catch(() => ''),
      this.git.raw(['log', '--oneline', `${baseSha}..${branch}`]).catch(() => ''),
      includePatch
        ? this.git.raw(['diff', baseSha, branch]).catch(() => '')
        : Promise.resolve(undefined),
    ]);

    // Parse numstat for aggregate stats + per-file stats (shared data, no duplication)
    const stats = this.parseNumstat(numstat);
    const files = this.parsePerFileStats(numstat, nameStatus);
    const commits = this.parseCommitLog(logOutput);

    return {
      stats,
      commits,
      files,
      ...(diffText !== undefined ? { diff: diffText } : {}),
    };
  }

  async getDiff(branch: string): Promise<DiffStats> {
    try {
      const baseSha = await this.getMergeBase(branch);
      const stat = await this.git.raw(['diff', '--numstat', baseSha, branch]);
      return this.parseNumstat(stat);
    } catch {
      return { files_changed: 0, insertions: 0, deletions: 0 };
    }
  }

  async getDiffText(branch: string): Promise<string> {
    try {
      const baseSha = await this.getMergeBase(branch);
      return await this.git.raw(['diff', baseSha, branch]);
    } catch {
      return '';
    }
  }

  async merge(branch: string): Promise<{ success: boolean; strategy?: string; commit?: string }> {
    try {
      // Try fast-forward first
      try {
        await this.git.raw(['merge', '--ff-only', branch]);
        const commit = (await this.git.raw(['rev-parse', 'HEAD'])).trim();
        return { success: true, strategy: 'fast-forward', commit };
      } catch {
        // Not fast-forwardable, try regular merge
      }

      const output = await this.git.raw(['merge', branch, '-m', `Merge ${branch}`]);

      // simple-git raw() may not throw on merge conflicts; check output
      if (output && output.includes('CONFLICT')) {
        try {
          await this.git.raw(['merge', '--abort']);
        } catch {
          // May not be in a merge state
        }
        return { success: false };
      }

      const commit = (await this.git.raw(['rev-parse', 'HEAD'])).trim();
      return { success: true, strategy: 'merge', commit };
    } catch {
      // Abort failed merge
      try {
        await this.git.raw(['merge', '--abort']);
      } catch {
        // May not be in a merge state
      }
      return { success: false };
    }
  }

  async getCommitLog(branch: string): Promise<CommitLogEntry[]> {
    try {
      const baseSha = await this.getMergeBase(branch);
      const output = await this.git.raw(['log', '--oneline', `${baseSha}..${branch}`]);
      return this.parseCommitLog(output);
    } catch {
      return [];
    }
  }

  async getPerFileStats(branch: string): Promise<FileStats[]> {
    try {
      const baseSha = await this.getMergeBase(branch);
      const [numstat, nameStatus] = await Promise.all([
        this.git.raw(['diff', '--numstat', baseSha, branch]),
        this.git.raw(['diff', '--name-status', baseSha, branch]),
      ]);
      return this.parsePerFileStats(numstat, nameStatus);
    } catch {
      return [];
    }
  }

  // --- Parsing helpers (pure, no git calls) ---

  private parseNumstat(numstat: string): DiffStats {
    if (!numstat.trim()) {
      return { files_changed: 0, insertions: 0, deletions: 0 };
    }

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    for (const line of numstat.trim().split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        filesChanged++;
        const added = parseInt(parts[0], 10);
        const removed = parseInt(parts[1], 10);
        if (!isNaN(added)) insertions += added;
        if (!isNaN(removed)) deletions += removed;
      }
    }

    return { files_changed: filesChanged, insertions, deletions };
  }

  private parsePerFileStats(numstat: string, nameStatus: string): FileStats[] {
    if (!numstat.trim()) return [];

    // Parse name-status for A/M/D indicators
    const statusMap = new Map<string, string>();
    for (const line of nameStatus.trim().split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        statusMap.set(parts[parts.length - 1], parts[0]);
      }
    }

    // Parse numstat for per-file counts
    return numstat.trim().split('\n').map((line) => {
      const parts = line.split('\t');
      if (parts.length < 3) return null;
      const file = parts[2];
      return {
        file,
        insertions: parseInt(parts[0], 10) || 0,
        deletions: parseInt(parts[1], 10) || 0,
        status: statusMap.get(file) || 'M',
      };
    }).filter((entry): entry is FileStats => entry !== null);
  }

  private parseCommitLog(output: string): CommitLogEntry[] {
    if (!output.trim()) return [];

    return output.trim().split('\n').map((line) => {
      const spaceIndex = line.indexOf(' ');
      return {
        sha: line.slice(0, spaceIndex),
        message: line.slice(spaceIndex + 1),
      };
    });
  }
}

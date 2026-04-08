import simpleGit from 'simple-git';
import type { DiffStats } from '../types.js';

export class Reviewer {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async getDiff(branch: string): Promise<DiffStats> {
    const git = simpleGit(this.repoRoot);

    try {
      // Find the merge base
      const base = await git.raw(['merge-base', 'HEAD', branch]);
      const baseSha = base.trim();

      // Get diff stats using numstat format
      const stat = await git.raw(['diff', '--numstat', baseSha, branch]);

      if (!stat.trim()) {
        return { files_changed: 0, insertions: 0, deletions: 0 };
      }

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      for (const line of stat.trim().split('\n')) {
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
    } catch {
      return { files_changed: 0, insertions: 0, deletions: 0 };
    }
  }

  async getDiffText(branch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);

    try {
      const base = await git.raw(['merge-base', 'HEAD', branch]);
      return await git.raw(['diff', base.trim(), branch]);
    } catch {
      return '';
    }
  }

  async merge(branch: string): Promise<{ success: boolean; strategy?: string; commit?: string }> {
    const git = simpleGit(this.repoRoot);

    try {
      // Try fast-forward first
      try {
        await git.raw(['merge', '--ff-only', branch]);
        const commit = (await git.raw(['rev-parse', 'HEAD'])).trim();
        return { success: true, strategy: 'fast-forward', commit };
      } catch {
        // Not fast-forwardable, try regular merge
      }

      const output = await git.raw(['merge', branch, '-m', `Merge ${branch}`]);

      // simple-git raw() may not throw on merge conflicts; check output
      if (output && output.includes('CONFLICT')) {
        try {
          await git.raw(['merge', '--abort']);
        } catch {
          // May not be in a merge state
        }
        return { success: false };
      }

      const commit = (await git.raw(['rev-parse', 'HEAD'])).trim();
      return { success: true, strategy: 'merge', commit };
    } catch {
      // Abort failed merge
      try {
        await git.raw(['merge', '--abort']);
      } catch {
        // May not be in a merge state
      }
      return { success: false };
    }
  }
}

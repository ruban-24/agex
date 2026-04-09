export type TaskStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'errored'
  | 'merged'
  | 'discarded';

export interface TaskEnv {
  AGENTPOD_TASK_ID: string;
  AGENTPOD_WORKTREE: string;
  AGENTPOD_PORT: string;
}

export interface VerificationCheck {
  cmd: string;
  passed: boolean;
  exit_code: number;
  duration_s: number;
  output?: string;
}

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
}

export interface DiffStats {
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface TaskRecord {
  id: string;
  prompt: string;
  cmd?: string;
  status: TaskStatus;
  branch: string;
  worktree: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  duration_s?: number;
  pid?: number;
  exit_code?: number;
  error?: string;
  env: TaskEnv;
  verification?: VerificationResult;
  diff_stats?: DiffStats;
}

export interface AgentpodConfig {
  verify?: string[];
  copy?: string[];
  symlink?: string[];
  setup?: string[];
}

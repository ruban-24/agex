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
  | 'discarded'
  | 'needs-input'
  | 'retried';

export interface TaskEnv {
  AGEX_TASK_ID: string;
  AGEX_WORKTREE: string;
  AGEX_PORT: string;
}

export interface ParsedError {
  file?: string;
  line?: number;
  message: string;
  rule?: string;
  expected?: string;
  actual?: string;
}

export interface NeedsInputPayload {
  question: string;
  options?: string[];
  context?: string;
}

export interface QAPair {
  question: string;
  answer: string;
  round: number;
}

export type VerifyCommand = string | { cmd: string; parser?: string };

export interface VerificationCheck {
  cmd: string;
  passed: boolean;
  exit_code: number;
  duration_s: number;
  output?: string;
  parsed?: ParsedError[];
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
  server_pid?: number;
  server_started_at?: string;
  // Retry
  retriedFrom?: string;
  retryDepth?: number;
  retryFeedback?: string;
  retryFromScratch?: boolean;
  // Needs-input
  needsInput?: NeedsInputPayload;
  responses?: QAPair[];
}

export interface RunConfig {
  cmd: string;
  port_env?: string;
}

export interface AgexConfig {
  verify?: VerifyCommand[];
  copy?: string[];
  symlink?: string[];
  setup?: string[];
  run?: RunConfig;
}

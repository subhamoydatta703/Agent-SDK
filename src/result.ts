export type RunStatus = 'completed' | 'max_turns_exceeded' | 'error' | 'guardrail_rejected';

export type RunErrorKind =
  | 'loop_detected'
  | 'handoff_loop'
  | 'model_error'
  | 'tool_error'
  | 'timeout'
  | 'structured_output'
  | 'invalid_input';

export interface RunErrorInfo {
  kind: RunErrorKind;
  message: string;
  toolName?: string;
  details?: unknown;
}

export interface RunResult<T = unknown> {
  status: RunStatus;
  /** Present when status === 'completed' and the agent declared an outputSchema. */
  data?: T;
  /** The final assistant text. */
  text?: string;
  runId: string;
  sessionId: string;
  /** Number of model iterations performed. */
  turns: number;
  /** Number of tool executions performed. */
  toolCalls: number;
  /** Ordered list of agent names visited (including handoffs). */
  agents: string[];
  durationMs: number;
  /** Human-readable reason for non-completed statuses. */
  reason?: string;
  error?: RunErrorInfo;
}

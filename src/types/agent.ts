export type AgentRole = 'planner' | 'generator' | 'evaluator';

export interface AgentInvocation {
  role: AgentRole;
  systemPrompt: string;
  userPrompt: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  workingDir: string;
}

export interface ClaudeJsonOutput {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error';
  is_error: boolean;
  result: string;
  cost_usd: number;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  session_id: string;
}

export interface AgentResult {
  role: AgentRole;
  success: boolean;
  output: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  sessionId: string;
  error?: string;
}

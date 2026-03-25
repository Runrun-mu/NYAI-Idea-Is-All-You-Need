// ─── Orchestrator States ───────────────────────────────────────────

export type State =
  | 'IDLE'
  | 'PLANNING'
  | 'CONTRACTING'
  | 'GENERATING'
  | 'EVALUATING'
  | 'BLOCKED'
  | 'DONE'
  | 'ERROR';

export interface StateHistoryEntry {
  from: State;
  to: State;
  timestamp: number;
  reason?: string;
}

// ─── Orchestrator Runtime State ────────────────────────────────────

export interface OrchestratorState {
  state: State;
  sprintId: string;
  round: number;
  prompt: string;
  startedAt: number;
  history: StateHistoryEntry[];
  costSpent: number;
  costBudget: number;
  currentAgent: import('./agent').AgentRole | null;
  lastEvalVerdict: import('./protocol').EvalVerdict | null;
  stuckCount: number;
  failedAcIds: string[];
}

// ─── Pending Decision ──────────────────────────────────────────────

export interface PendingDecision {
  id: string;
  timestamp: number;
  agentRole: import('./agent').AgentRole;
  type: 'architecture' | 'dependency' | 'scope' | 'risk' | 'other';
  summary: string;
  details: string;
  options: string[];
  autoApproveAfterMs?: number;
  resolved?: boolean;
  resolution?: string;
  resolvedAt?: number;
}

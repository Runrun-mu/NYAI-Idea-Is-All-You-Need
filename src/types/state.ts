// ─── Orchestrator States ───────────────────────────────────────────

export type State =
  | 'IDLE'
  | 'ARCHITECTING'
  | 'PLANNING'
  | 'REVIEWING'          // v0.6: Evaluator reviews planner's critical-path & spec
  | 'CONTRACTING'
  | 'GENERATING'
  | 'EVALUATING'
  | 'REPLANNING'
  | 'CHECKPOINT'         // v0.6: Post-feature checkpoint + critical-path regression
  | 'GOAL_ACCEPTANCE'    // v0.6: Final goal-level acceptance after all features
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
  currentFeatureIndex?: number;
  totalFeatures?: number;
  previouslyPassedAcs: string[];
  timeoutRetryCount: number;
  totalGeneratorTimeMs: number;
  // v0.6 goal-driven fields
  completedFeatures: string[];          // Feature IDs that have passed
  goalAcceptanceAttempts: number;        // How many times goal acceptance was tried
  issues: import('./protocol').Issue[];  // All raised issues across the sprint
}

// ─── Pending Decision ──────────────────────────────────────────────

export interface PendingDecision {
  id: string;
  timestamp: number;
  agentRole: import('./agent').AgentRole;
  type: 'architecture' | 'dependency' | 'scope' | 'risk' | 'goal' | 'other';
  severity: import('./protocol').IssueSeverity;  // v0.6: P0-P4
  summary: string;
  details: string;
  options: string[];
  autoApproveAfterMs?: number;
  resolved?: boolean;
  resolution?: string;
  resolvedAt?: number;
  autoDecision?: boolean;
}

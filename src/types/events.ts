import type { AgentRole, AgentResult } from './agent';
import type { State, PendingDecision } from './state';
import type { EvalVerdict, EvalReport, ArchitectureRecord, RegressionInfo } from './protocol';

// ─── Tagged Union of all Orchestrator Events ───────────────────────

export type OrchestratorEvent =
  | StateChangeEvent
  | AgentStartEvent
  | AgentLogEvent
  | AgentDoneEvent
  | EvalVerdictEvent
  | DecisionNeededEvent
  | DecisionResolvedEvent
  | CostUpdateEvent
  | ErrorEvent
  | DoneEvent
  | ArchitectDoneEvent
  | FeatureProgressEvent
  | RegressionDetectedEvent
  | AgentTimeoutEvent
  | PlannerReplanEvent
  | ParallelBatchEvent
  | RetrospectiveDoneEvent
  | BacklogPickedEvent
  | BacklogDoneEvent
  | SprintResumedEvent;

export interface StateChangeEvent {
  type: 'state:change';
  from: State;
  to: State;
  timestamp: number;
}

export interface AgentStartEvent {
  type: 'agent:start';
  role: AgentRole;
  round: number;
  timestamp: number;
}

export interface AgentLogEvent {
  type: 'agent:log';
  role: AgentRole;
  line: string;
  timestamp: number;
}

export interface AgentDoneEvent {
  type: 'agent:done';
  role: AgentRole;
  result: AgentResult;
  timestamp: number;
}

export interface EvalVerdictEvent {
  type: 'eval:verdict';
  verdict: EvalVerdict;
  report: EvalReport;
  timestamp: number;
}

export interface DecisionNeededEvent {
  type: 'decision:needed';
  decision: PendingDecision;
  timestamp: number;
}

export interface DecisionResolvedEvent {
  type: 'decision:resolved';
  decisionId: string;
  resolution: string;
  timestamp: number;
}

export interface CostUpdateEvent {
  type: 'cost:update';
  spent: number;
  budget: number;
  timestamp: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  timestamp: number;
}

export interface DoneEvent {
  type: 'done';
  summary: string;
  totalCost: number;
  totalDuration: number;
  rounds: number;
  timestamp: number;
}

// ─── New Events (v0.2) ───────────────────────────────────────────

export interface ArchitectDoneEvent {
  type: 'architect:done';
  record: ArchitectureRecord;
  timestamp: number;
}

export interface FeatureProgressEvent {
  type: 'feature:progress';
  featureIndex: number;
  totalFeatures: number;
  featureTitle: string;
  status: 'started' | 'completed' | 'skipped';
  timestamp: number;
}

export interface RegressionDetectedEvent {
  type: 'eval:regression';
  regressions: RegressionInfo[];
  round: number;
  timestamp: number;
}

// ─── New Events (v0.2.1) ───────────────────────────────────────────

export interface AgentTimeoutEvent {
  type: 'agent:timeout';
  role: AgentRole;
  round: number;
  retryCount: number;
  durationMs: number;
  filesModified: string[];
  timestamp: number;
}

export interface PlannerReplanEvent {
  type: 'planner:replan';
  reason: string;
  originalFeature: string;
  timestamp: number;
}

export interface ParallelBatchEvent {
  type: 'parallel:batch';
  generatorCount: number;
  assignments: string[][];
  timestamp: number;
}

// ─── New Events (v0.3) ───────────────────────────────────────────

export interface RetrospectiveDoneEvent {
  type: 'retrospective:done';
  sprintId: string;
  timestamp: number;
}

export interface BacklogPickedEvent {
  type: 'backlog:picked';
  itemId: string;
  title: string;
  timestamp: number;
}

export interface BacklogDoneEvent {
  type: 'backlog:done';
  itemId: string;
  timestamp: number;
}

export interface SprintResumedEvent {
  type: 'sprint:resumed';
  sprintId: string;
  fromState: State;
  fromRound: number;
  timestamp: number;
}

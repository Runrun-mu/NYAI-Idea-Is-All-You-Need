import { useState, useEffect, useCallback } from 'react';
import type { Orchestrator } from '../../core/orchestrator';
import type { OrchestratorEvent } from '../../types/events';
import type { State } from '../../types/state';
import type { AgentRole, AgentResult } from '../../types/agent';
import type { EvalVerdict, EvalReport } from '../../types/protocol';
import type { PendingDecision } from '../../types/state';

export interface OrchestratorUIState {
  state: State;
  round: number;
  sprintId: string;
  currentAgent: AgentRole | null;
  logs: LogLine[];
  costSpent: number;
  costBudget: number;
  lastVerdict: EvalVerdict | null;
  lastReport: EvalReport | null;
  pendingDecision: PendingDecision | null;
  error: string | null;
  done: boolean;
  doneSummary: string | null;
  agentStatuses: Record<AgentRole, AgentStatus>;
}

export interface LogLine {
  role: AgentRole;
  line: string;
  timestamp: number;
}

export interface AgentStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  lastResult?: AgentResult;
  startedAt?: number;
}

const MAX_LOG_LINES = 200;

const initialAgentStatuses: Record<AgentRole, AgentStatus> = {
  planner: { status: 'idle' },
  generator: { status: 'idle' },
  evaluator: { status: 'idle' },
};

export function useOrchestrator(orchestrator: Orchestrator): OrchestratorUIState {
  const [state, setState] = useState<State>('IDLE');
  const [round, setRound] = useState(0);
  const [sprintId, setSprintId] = useState('');
  const [currentAgent, setCurrentAgent] = useState<AgentRole | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [costSpent, setCostSpent] = useState(0);
  const [costBudget, setCostBudget] = useState(0);
  const [lastVerdict, setLastVerdict] = useState<EvalVerdict | null>(null);
  const [lastReport, setLastReport] = useState<EvalReport | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneSummary, setDoneSummary] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState(initialAgentStatuses);

  useEffect(() => {
    const handler = (event: OrchestratorEvent) => {
      switch (event.type) {
        case 'state:change':
          setState(event.to);
          break;

        case 'agent:start':
          setCurrentAgent(event.role);
          setRound(event.round);
          setAgentStatuses((prev) => ({
            ...prev,
            [event.role]: { status: 'running', startedAt: event.timestamp },
          }));
          break;

        case 'agent:log':
          setLogs((prev) => {
            const next = [...prev, { role: event.role, line: event.line, timestamp: event.timestamp }];
            return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
          });
          break;

        case 'agent:done':
          setCurrentAgent(null);
          setAgentStatuses((prev) => ({
            ...prev,
            [event.role]: {
              status: event.result.success ? 'done' : 'error',
              lastResult: event.result,
            },
          }));
          break;

        case 'eval:verdict':
          setLastVerdict(event.verdict);
          setLastReport(event.report);
          break;

        case 'decision:needed':
          setPendingDecision(event.decision);
          break;

        case 'decision:resolved':
          setPendingDecision(null);
          break;

        case 'cost:update':
          setCostSpent(event.spent);
          setCostBudget(event.budget);
          break;

        case 'error':
          setError(event.message);
          break;

        case 'done':
          setDone(true);
          setDoneSummary(event.summary);
          break;
      }
    };

    orchestrator.on('*', handler);

    // Set initial state
    const s = orchestrator.getState();
    setSprintId(s.sprintId);
    setCostBudget(s.costBudget);

    return () => {
      orchestrator.off('*', handler);
    };
  }, [orchestrator]);

  return {
    state,
    round,
    sprintId,
    currentAgent,
    logs,
    costSpent,
    costBudget,
    lastVerdict,
    lastReport,
    pendingDecision,
    error,
    done,
    doneSummary,
    agentStatuses,
  };
}

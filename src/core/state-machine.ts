import type { State, StateHistoryEntry } from '../types/state';

/**
 * Valid state transitions for the orchestrator.
 * This is a pure function — no I/O, no side effects.
 */
const TRANSITIONS: Record<State, State[]> = {
  IDLE: ['ARCHITECTING', 'PLANNING'],
  ARCHITECTING: ['PLANNING', 'ERROR'],
  PLANNING: ['REVIEWING', 'CONTRACTING', 'ERROR'],          // v0.6: can go to REVIEWING
  REVIEWING: ['CONTRACTING', 'PLANNING', 'ERROR'],          // v0.6: review → contract or back to planning
  CONTRACTING: ['GENERATING', 'ERROR'],
  GENERATING: ['EVALUATING', 'REPLANNING', 'ERROR'],
  EVALUATING: ['GENERATING', 'CHECKPOINT', 'DONE', 'BLOCKED', 'REPLANNING', 'ERROR'],  // v0.6: can go to CHECKPOINT
  REPLANNING: ['GENERATING', 'DONE', 'ERROR'],
  CHECKPOINT: ['GENERATING', 'GOAL_ACCEPTANCE', 'DEPLOYING', 'DONE', 'ERROR'],  // v0.6: after checkpoint → next feature, goal acceptance, or deploy
  GOAL_ACCEPTANCE: ['PLANNING', 'DEPLOYING', 'DONE', 'BLOCKED', 'ERROR'],       // v0.6: goal acceptance → done, deploy, replan, or blocked
  DEPLOYING: ['DONE', 'ERROR'],                                                  // v0.4: deployer → done or error
  BLOCKED: ['GENERATING', 'DONE', 'ERROR'],
  DONE: ['IDLE'],
  ERROR: ['IDLE'],
};

export function canTransition(from: State, to: State): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(
  from: State,
  to: State,
  reason?: string
): StateHistoryEntry {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
  return {
    from,
    to,
    timestamp: Date.now(),
    reason,
  };
}

/**
 * Determine the next state after evaluation.
 */
export function nextStateAfterEval(
  verdict: 'PASS' | 'FAIL' | 'PARTIAL',
  round: number,
  maxRounds: number,
  isStuck: boolean
): State {
  if (verdict === 'PASS') return 'DONE';
  if (round >= maxRounds) return 'DONE'; // give up after max rounds
  if (isStuck) return 'BLOCKED';
  return 'GENERATING'; // try again
}

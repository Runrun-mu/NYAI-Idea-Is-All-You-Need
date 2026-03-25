export type EvalVerdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface EvalReport {
  sprintId: string;
  round: number;
  verdict: EvalVerdict;
  timestamp: number;
  summary: string;
  passedAcs: string[];
  failedAcs: FailedAc[];
  suggestions: string[];
  score?: number;
}

export interface FailedAc {
  id: string;
  description: string;
  reason: string;
}

export interface FeatureSpec {
  sprintId: string;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  outOfScope: string[];
  techNotes?: string;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  testable: boolean;
}

export interface SprintContract {
  sprintId: string;
  specPath: string;
  round: number;
  generatorInstructions: string;
  evaluatorInstructions: string;
}

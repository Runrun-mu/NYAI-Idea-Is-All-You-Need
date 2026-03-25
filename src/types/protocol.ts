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
  regressions?: RegressionInfo[];
}

export interface FailedAc {
  id: string;
  description: string;
  reason: string;
}

export interface RegressionInfo {
  acId: string;
  description: string;
  previousStatus: 'PASS';
  currentStatus: 'FAIL';
  round: number;
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

// ─── Architecture Record (F1) ─────────────────────────────────────

export interface ArchitectureRecord {
  sprintId: string;
  timestamp: number;
  techStack: string[];
  scaffolding: string[];
  ciCd?: string;
  decisions: string[];
  notes?: string;
}

// ─── Feature List (F5) ────────────────────────────────────────────

export type FeatureStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: FeatureStatus;
  sprintId?: string;
  completedAt?: number;
}

export interface FeatureList {
  parentPrompt: string;
  features: FeatureItem[];
  createdAt: number;
  updatedAt: number;
}

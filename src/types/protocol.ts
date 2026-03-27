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
  testResults?: {
    ran: boolean;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    details: TestPlanResult[];
    rawOutput?: string;
  };
  timeoutRecommendation?: 'continue' | 'abort' | 'simplify';
  estimatedAdditionalTimeMs?: number;
  timeoutReason?: string;
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
  testInfra?: {
    unitRunner?: string;     // "vitest" | "bun:test" | "jest"
    unitCommand?: string;    // "npx vitest run" | "bun test"
    e2eCommand?: string;     // "bash scripts/e2e-test.sh"
    devServerCommand?: string; // "bun run dev"
    devServerPort?: number;    // 3000
  };
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

// ─── Test Plan (v0.5) ────────────────────────────────────────────

export interface TestPlan {
  sprintId: string;
  testCases: TestCase[];
}

export interface TestCase {
  id: string;            // "TC-1"
  acId: string;          // "AC-1"
  title: string;         // "角色选择页渲染全部6个角色"
  type: 'unit' | 'integration' | 'e2e';
  steps: TestStep[];
  expectedResult: string;
  automatable: boolean;
}

export interface TestStep {
  action: string;
  expected: string;
  command?: string;      // 可执行的验证命令
}

export interface TestPlanResult {
  testCaseId: string;
  acId: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';
  output?: string;
}

// ─── Issue Severity (v0.6) ────────────────────────────────────────

export type IssueSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  featureId?: string;
  source: 'evaluator' | 'generator' | 'planner' | 'orchestrator';
  needsDecision: boolean;
  options?: string[];
  createdAt: number;
  resolvedAt?: number;
  resolution?: string;
}

// ─── Critical Path (v0.6) ─────────────────────────────────────────

export interface CriticalPathStep {
  id: string;             // "CP-1"
  description: string;    // "Open browser to localhost:3000"
  verifyCommand?: string; // "curl -s localhost:3000 | grep '<title>'"
  expectedOutput?: string;
  dependsOn?: string[];   // ["CP-1"] — ordering
}

export interface CriticalPath {
  sprintId: string;
  goalSummary: string;          // One-line summary of user's goal
  steps: CriticalPathStep[];
  createdAt: number;
  reviewedByEvaluator?: boolean;
  evaluatorAmendments?: string[];
}

// ─── Checkpoint Report (v0.6) ─────────────────────────────────────

export type CheckpointType = 'feature' | 'integration' | 'goal';

export interface Artifact {
  type: 'screenshot' | 'text' | 'html_snapshot' | 'test_output';
  title: string;
  path: string;
  description: string;
}

export interface CheckpointReport {
  type: CheckpointType;
  sprintId: string;
  featureId?: string;
  completedFeatures: string[];
  remainingFeatures: string[];
  criticalPathStatus: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_RUN';
  criticalPathResults?: {
    stepId: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    actualOutput?: string;
  }[];
  testSummary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  artifacts: Artifact[];
  issues: Issue[];
  narrative: string;
  timestamp: number;
}

// ─── Timeout Context (v0.2.1) ────────────────────────────────────

export interface TimeoutContext {
  round: number;
  durationMs: number;
  partialOutput: string;
  filesModified: string[];
  retryCount: number;
  totalTimeSpentMs: number;
}

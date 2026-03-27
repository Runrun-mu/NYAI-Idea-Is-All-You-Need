import { describe, test, expect } from 'bun:test';
import { canTransition } from '../src/core/state-machine';
import type { IssueSeverity, CriticalPath, CheckpointReport, Issue } from '../src/types/protocol';
import type { State, PendingDecision, OrchestratorState } from '../src/types/state';
import {
  writeCheckpoint,
  readCheckpoints,
  readCriticalPath,
  writeCriticalPath,
  buildCheckpointReport,
  ensureCheckpointDir,
} from '../src/protocol/checkpoint';
import { buildReviewInvocation, buildGoalAcceptanceInvocation } from '../src/agents/evaluator';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── State Machine v0.6 Transitions ────────────────────────────────

describe('v0.6 state machine transitions', () => {
  test('PLANNING → REVIEWING is valid', () => {
    expect(canTransition('PLANNING', 'REVIEWING')).toBe(true);
  });

  test('REVIEWING → CONTRACTING is valid', () => {
    expect(canTransition('REVIEWING', 'CONTRACTING')).toBe(true);
  });

  test('REVIEWING → PLANNING is valid (back to planning)', () => {
    expect(canTransition('REVIEWING', 'PLANNING')).toBe(true);
  });

  test('REVIEWING → ERROR is valid', () => {
    expect(canTransition('REVIEWING', 'ERROR')).toBe(true);
  });

  test('EVALUATING → CHECKPOINT is valid', () => {
    expect(canTransition('EVALUATING', 'CHECKPOINT')).toBe(true);
  });

  test('CHECKPOINT → GENERATING is valid (next feature)', () => {
    expect(canTransition('CHECKPOINT', 'GENERATING')).toBe(true);
  });

  test('CHECKPOINT → GOAL_ACCEPTANCE is valid', () => {
    expect(canTransition('CHECKPOINT', 'GOAL_ACCEPTANCE')).toBe(true);
  });

  test('CHECKPOINT → DONE is valid', () => {
    expect(canTransition('CHECKPOINT', 'DONE')).toBe(true);
  });

  test('GOAL_ACCEPTANCE → DONE is valid', () => {
    expect(canTransition('GOAL_ACCEPTANCE', 'DONE')).toBe(true);
  });

  test('GOAL_ACCEPTANCE → PLANNING is valid (incremental replan)', () => {
    expect(canTransition('GOAL_ACCEPTANCE', 'PLANNING')).toBe(true);
  });

  test('GOAL_ACCEPTANCE → BLOCKED is valid', () => {
    expect(canTransition('GOAL_ACCEPTANCE', 'BLOCKED')).toBe(true);
  });

  test('GOAL_ACCEPTANCE → ERROR is valid', () => {
    expect(canTransition('GOAL_ACCEPTANCE', 'ERROR')).toBe(true);
  });

  test('IDLE → REVIEWING is invalid', () => {
    expect(canTransition('IDLE', 'REVIEWING')).toBe(false);
  });

  test('IDLE → CHECKPOINT is invalid', () => {
    expect(canTransition('IDLE', 'CHECKPOINT')).toBe(false);
  });
});

// ─── Issue Severity Types ──────────────────────────────────────────

describe('Issue severity types', () => {
  test('all severity levels are valid', () => {
    const levels: IssueSeverity[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
    expect(levels).toHaveLength(5);
  });

  test('Issue interface has required fields', () => {
    const issue: Issue = {
      id: 'issue-1',
      severity: 'P1',
      title: 'Test issue',
      description: 'A test issue',
      source: 'evaluator',
      needsDecision: true,
      options: ['Fix', 'Skip'],
      createdAt: Date.now(),
    };
    expect(issue.severity).toBe('P1');
    expect(issue.needsDecision).toBe(true);
  });

  test('PendingDecision includes severity field', () => {
    const decision: PendingDecision = {
      id: 'dec-1',
      timestamp: Date.now(),
      agentRole: 'evaluator',
      type: 'scope',
      severity: 'P0',
      summary: 'Critical issue',
      details: 'Details',
      options: ['Fix', 'Abort'],
    };
    expect(decision.severity).toBe('P0');
  });
});

// ─── Critical Path Types ──────────────────────────────────────────

describe('CriticalPath types', () => {
  test('CriticalPath interface has required fields', () => {
    const cp: CriticalPath = {
      sprintId: 'sprint-123',
      goalSummary: 'Build a snake game',
      steps: [
        {
          id: 'CP-1',
          description: 'Open the game',
          verifyCommand: 'curl -s http://localhost:3000',
          expectedOutput: '<html>',
        },
      ],
      createdAt: Date.now(),
    };
    expect(cp.steps).toHaveLength(1);
    expect(cp.steps[0].id).toBe('CP-1');
  });
});

// ─── Checkpoint Module ────────────────────────────────────────────

describe('Checkpoint module', () => {
  const testDir = join(tmpdir(), `nyai-test-checkpoint-${Date.now()}`);
  const harnessDir = join(testDir, '.harness');

  test('ensureCheckpointDir creates directories', () => {
    mkdirSync(harnessDir, { recursive: true });
    const cpDir = ensureCheckpointDir(harnessDir);
    expect(existsSync(cpDir)).toBe(true);
    expect(existsSync(join(cpDir, 'artifacts'))).toBe(true);
  });

  test('writeCheckpoint and readCheckpoints round-trip', () => {
    const report = buildCheckpointReport({
      type: 'feature',
      sprintId: 'sprint-123',
      featureId: 'F-1',
      completedFeatures: ['F-1'],
      remainingFeatures: ['F-2', 'F-3'],
      criticalPathStatus: 'PASS',
      testSummary: { total: 10, passed: 9, failed: 1, skipped: 0 },
      artifacts: [],
      issues: [],
      narrative: 'Feature 1 completed successfully.',
    });

    writeCheckpoint(harnessDir, report);
    const checkpoints = readCheckpoints(harnessDir);
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(checkpoints[0].sprintId).toBe('sprint-123');
    expect(checkpoints[0].type).toBe('feature');
    expect(checkpoints[0].criticalPathStatus).toBe('PASS');
  });

  test('readCheckpoints returns empty for missing dir', () => {
    const result = readCheckpoints('/tmp/nonexistent-dir');
    expect(result).toEqual([]);
  });

  test('critical path write and read round-trip', () => {
    const cp: CriticalPath = {
      sprintId: 'sprint-456',
      goalSummary: 'Build a calculator',
      steps: [
        { id: 'CP-1', description: 'Load page', verifyCommand: 'curl localhost:3000', expectedOutput: '<html>' },
        { id: 'CP-2', description: 'Add numbers', verifyCommand: 'curl localhost:3000/add?a=1&b=2', expectedOutput: '3', dependsOn: ['CP-1'] },
      ],
      createdAt: Date.now(),
    };

    writeCriticalPath(harnessDir, 'sprint-456', cp);
    const read = readCriticalPath(harnessDir, 'sprint-456');
    expect(read).not.toBeNull();
    expect(read!.goalSummary).toBe('Build a calculator');
    expect(read!.steps).toHaveLength(2);
  });

  test('readCriticalPath returns null for missing file', () => {
    expect(readCriticalPath(harnessDir, 'nonexistent')).toBeNull();
  });

  // Cleanup
  test('cleanup test dir', () => {
    rmSync(testDir, { recursive: true, force: true });
  });
});

// ─── OrchestratorState v0.6 fields ────────────────────────────────

describe('OrchestratorState v0.6 fields', () => {
  test('has completedFeatures field', () => {
    const state: Partial<OrchestratorState> = {
      completedFeatures: ['F-1', 'F-2'],
      goalAcceptanceAttempts: 1,
      issues: [],
    };
    expect(state.completedFeatures).toHaveLength(2);
    expect(state.goalAcceptanceAttempts).toBe(1);
  });
});

// ─── Evaluator Review Invocation ──────────────────────────────────

describe('buildReviewInvocation', () => {
  test('produces valid invocation with review prompt', () => {
    const config = {
      project: { name: 'test', rootDir: '/tmp/test' },
      budget: { maxCostUsd: 5, maxRounds: 10, maxDurationMinutes: 60 },
      agents: { planner: {}, generator: {}, evaluator: {} },
      autonomy: { autoApproveDecisions: false, autoApproveTimeoutMs: 0 },
    };

    const inv = buildReviewInvocation(config, 'sprint-123');
    expect(inv.role).toBe('evaluator');
    expect(inv.userPrompt).toContain('Review Mode');
    expect(inv.userPrompt).toContain('critical-path');
    expect(inv.userPrompt).toContain('reviewedByEvaluator');
  });
});

// ─── Goal Acceptance Invocation ───────────────────────────────────

describe('buildGoalAcceptanceInvocation', () => {
  const config = {
    project: { name: 'test', rootDir: '/tmp/test' },
    budget: { maxCostUsd: 5, maxRounds: 10, maxDurationMinutes: 60 },
    agents: { planner: {}, generator: {}, evaluator: {} },
    autonomy: { autoApproveDecisions: false, autoApproveTimeoutMs: 0 },
  };

  const criticalPath: CriticalPath = {
    sprintId: 'sprint-123',
    goalSummary: 'Build snake game',
    steps: [
      { id: 'CP-1', description: 'Load game', verifyCommand: 'curl localhost:3000', expectedOutput: '<html>' },
    ],
    createdAt: Date.now(),
  };

  test('goal mode produces goal acceptance prompt', () => {
    const inv = buildGoalAcceptanceInvocation(config, 'sprint-123', 'Build a snake game', criticalPath, ['F-1'], 'goal');
    expect(inv.role).toBe('evaluator');
    expect(inv.userPrompt).toContain('Goal Acceptance');
    expect(inv.userPrompt).toContain('goalVerdict');
    expect(inv.userPrompt).toContain('CP-1');
    expect(inv.userPrompt).toContain('F-1');
  });

  test('checkpoint mode produces checkpoint prompt', () => {
    const inv = buildGoalAcceptanceInvocation(config, 'sprint-123', 'Build a snake game', criticalPath, [], 'checkpoint');
    expect(inv.role).toBe('evaluator');
    expect(inv.userPrompt).toContain('Critical Path Checkpoint');
    expect(inv.userPrompt).toContain('regression');
  });
});

// ─── Planner Critical Path Output ─────────────────────────────────

describe('Planner critical-path output', () => {
  test('planner prompt includes critical path instructions', async () => {
    const { buildPlannerInvocation } = await import('../src/agents/planner');
    const config = {
      project: { name: 'test', rootDir: '/tmp/test' },
      budget: { maxCostUsd: 5, maxRounds: 10, maxDurationMinutes: 60 },
      agents: { planner: {}, generator: {}, evaluator: {} },
      autonomy: { autoApproveDecisions: false, autoApproveTimeoutMs: 0 },
    };

    const inv = buildPlannerInvocation(config, 'Build a todo app', 'sprint-1');
    expect(inv.userPrompt).toContain('critical-path');
    expect(inv.userPrompt).toContain('Critical Path Output (MANDATORY');
    expect(inv.userPrompt).toContain('goalSummary');
    expect(inv.userPrompt).toContain('verifyCommand');
  });
});

// ─── File Protocol v0.6 ──────────────────────────────────────────

describe('file-protocol v0.6 directories', () => {
  test('ensureHarnessDir creates critical-path and checkpoints dirs', async () => {
    const { ensureHarnessDir } = await import('../src/protocol/file-protocol');
    const testRoot = join(tmpdir(), `nyai-test-harness-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });

    const hdir = ensureHarnessDir(testRoot);
    expect(existsSync(join(hdir, 'critical-path'))).toBe(true);
    expect(existsSync(join(hdir, 'checkpoints'))).toBe(true);
    expect(existsSync(join(hdir, 'checkpoints', 'artifacts'))).toBe(true);

    rmSync(testRoot, { recursive: true, force: true });
  });
});

import { describe, test, expect } from 'bun:test';
import { buildGeneratorInvocation } from '../src/agents/generator';
import { buildEvaluatorInvocation } from '../src/agents/evaluator';
import { defaultConfig } from '../src/types/config';
import type { RegressionInfo, TestPlan, ArchitectureRecord } from '../src/types/protocol';

const config = defaultConfig('test', '/tmp/test-project');

describe('generator — regression protection', () => {
  test('includes regression protection when previouslyPassedAcs provided', () => {
    const inv = buildGeneratorInvocation(
      config,
      'sprint-1',
      2,
      undefined,
      ['AC-1', 'AC-2']
    );
    expect(inv.userPrompt).toContain('REGRESSION PROTECTION');
    expect(inv.userPrompt).toContain('AC-1');
    expect(inv.userPrompt).toContain('AC-2');
    expect(inv.userPrompt).toContain('DO NOT REGRESS');
  });

  test('includes regression fix instructions when regressions detected', () => {
    const regressions: RegressionInfo[] = [
      { acId: 'AC-1', description: 'Login works', previousStatus: 'PASS', currentStatus: 'FAIL', round: 3 },
    ];

    const inv = buildGeneratorInvocation(
      config,
      'sprint-1',
      4,
      undefined,
      ['AC-1', 'AC-2'],
      regressions
    );
    expect(inv.userPrompt).toContain('REGRESSIONS DETECTED');
    expect(inv.userPrompt).toContain('AC-1');
    expect(inv.userPrompt).toContain('was PASS in round 3');
  });

  test('does not include regression protection when no previous ACs', () => {
    const inv = buildGeneratorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).not.toContain('REGRESSION PROTECTION');
  });
});

describe('generator — test-first mode', () => {
  test('includes test-first instructions by default', () => {
    const inv = buildGeneratorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).toContain('TEST-FIRST MODE');
    expect(inv.userPrompt).toContain('Write failing tests');
  });

  test('excludes test-first when disabled', () => {
    const noTestFirst = { ...config, testFirst: false };
    const inv = buildGeneratorInvocation(noTestFirst, 'sprint-1', 1);
    expect(inv.userPrompt).not.toContain('TEST-FIRST MODE');
  });
});

describe('evaluator — regression detection', () => {
  test('includes regression check when previouslyPassedAcs provided', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 2, ['AC-1', 'AC-3']);
    expect(inv.userPrompt).toContain('REGRESSION DETECTION');
    expect(inv.userPrompt).toContain('AC-1');
    expect(inv.userPrompt).toContain('AC-3');
  });

  test('does not include regression check without previous ACs', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).not.toContain('REGRESSION DETECTION');
  });
});

describe('evaluator — test-first verification', () => {
  test('includes test-first verification by default', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).toContain('TEST-FIRST VERIFICATION');
  });

  test('excludes test-first verification when disabled', () => {
    const noTestFirst = { ...config, testFirst: false };
    const inv = buildEvaluatorInvocation(noTestFirst, 'sprint-1', 1);
    expect(inv.userPrompt).not.toContain('TEST-FIRST VERIFICATION');
  });
});

describe('evaluator — output includes regressions field', () => {
  test('report JSON schema includes regressions', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).toContain('"regressions"');
  });
});

// ─── v0.5: Test Plan Integration ─────────────────────────────────

describe('generator — test plan consumption (v0.5)', () => {
  const testPlan: TestPlan = {
    sprintId: 'sprint-1',
    testCases: [
      {
        id: 'TC-1',
        acId: 'AC-1',
        title: 'Homepage returns 200',
        type: 'e2e',
        steps: [{ action: 'curl homepage', expected: '200', command: 'curl -s localhost:3000' }],
        expectedResult: '200',
        automatable: true,
      },
      {
        id: 'TC-2',
        acId: 'AC-2',
        title: 'Unit test for add function',
        type: 'unit',
        steps: [{ action: 'Run test', expected: 'Pass', command: 'bun test add.test.ts' }],
        expectedResult: 'PASS',
        automatable: true,
      },
    ],
  };

  test('includes test plan summary when testPlan provided', () => {
    const inv = buildGeneratorInvocation(
      config, 'sprint-1', 1, undefined, undefined, undefined, undefined, testPlan
    );
    expect(inv.userPrompt).toContain('TEST PLAN');
    expect(inv.userPrompt).toContain('TC-1');
    expect(inv.userPrompt).toContain('TC-2');
    expect(inv.userPrompt).toContain('Homepage returns 200');
    expect(inv.userPrompt).toContain('2 test case(s)');
  });

  test('does not include test plan section when no testPlan', () => {
    const inv = buildGeneratorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).not.toContain('TEST PLAN');
  });
});

describe('evaluator — test execution protocol (v0.5)', () => {
  test('includes 3-step evaluation protocol', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).toContain('Step 1: Execute Automated Test Suite');
    expect(inv.userPrompt).toContain('Step 2: Execute Test Plan Verification');
    expect(inv.userPrompt).toContain('Step 3: Supplementary Code Review');
  });

  test('includes strict verdict rules', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).toContain('verdict MUST NOT be "PASS"');
    expect(inv.userPrompt).toContain('untested');
  });

  test('includes testResults in report schema', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.userPrompt).toContain('"testResults"');
    expect(inv.userPrompt).toContain('"ran"');
    expect(inv.userPrompt).toContain('"rawOutput"');
  });

  test('includes architecture test commands when archRecord provided', () => {
    const archRecord = {
      sprintId: 'sprint-1',
      timestamp: Date.now(),
      techStack: ['TypeScript', 'Bun'],
      scaffolding: [],
      decisions: [],
      testInfra: {
        unitRunner: 'vitest',
        unitCommand: 'npx vitest run',
        e2eCommand: 'bash scripts/e2e-test.sh',
      },
    } as ArchitectureRecord;

    const inv = buildEvaluatorInvocation(
      config, 'sprint-1', 1, undefined, undefined, undefined, archRecord
    );
    expect(inv.userPrompt).toContain('npx vitest run');
    expect(inv.userPrompt).toContain('bash scripts/e2e-test.sh');
  });

  test('includes test plan details when testPlan provided', () => {
    const testPlan: TestPlan = {
      sprintId: 'sprint-1',
      testCases: [
        {
          id: 'TC-1',
          acId: 'AC-1',
          title: 'Check homepage',
          type: 'e2e',
          steps: [{ action: 'curl', expected: '200', command: 'curl localhost:3000' }],
          expectedResult: '200',
          automatable: true,
        },
      ],
    };

    const inv = buildEvaluatorInvocation(
      config, 'sprint-1', 1, undefined, undefined, undefined, undefined, testPlan
    );
    expect(inv.userPrompt).toContain('TC-1');
    expect(inv.userPrompt).toContain('Check homepage');
    expect(inv.userPrompt).toContain('RUN');
  });

  test('evaluator has Write in allowedTools', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.allowedTools).toContain('Write');
    expect(inv.allowedTools).toContain('Bash');
  });

  test('evaluator does not have Edit in disallowedTools', () => {
    const inv = buildEvaluatorInvocation(config, 'sprint-1', 1);
    expect(inv.disallowedTools).toContain('Edit');
    expect(inv.disallowedTools).not.toContain('Write');
  });
});

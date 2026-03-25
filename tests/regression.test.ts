import { describe, test, expect } from 'bun:test';
import { buildGeneratorInvocation } from '../src/agents/generator';
import { buildEvaluatorInvocation } from '../src/agents/evaluator';
import { defaultConfig } from '../src/types/config';
import type { RegressionInfo } from '../src/types/protocol';

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

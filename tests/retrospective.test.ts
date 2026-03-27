import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  buildRetrospective,
  extractBuiltItems,
  extractChallenges,
  extractPatterns,
} from '../src/protocol/retrospective';
import type { OrchestratorState } from '../src/types/state';
import type { EvalReport } from '../src/types/protocol';

const TEST_DIR = join(import.meta.dir, '.test-retro');
const HARNESS_DIR = join(TEST_DIR, '.harness');

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    state: 'DONE',
    sprintId: 'sprint-123',
    round: 3,
    prompt: 'Build an MBTI quiz app',
    startedAt: Date.now() - 60000,
    history: [],
    costSpent: 0.15,
    costBudget: 5.0,
    currentAgent: null,
    lastEvalVerdict: 'PASS',
    stuckCount: 0,
    failedAcIds: [],
    previouslyPassedAcs: ['AC-1', 'AC-2', 'AC-3'],
    timeoutRetryCount: 0,
    totalGeneratorTimeMs: 30000,
    ...overrides,
  };
}

function makeReport(round: number, overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    sprintId: 'sprint-123',
    round,
    verdict: 'PARTIAL',
    timestamp: Date.now(),
    summary: 'Partial progress',
    passedAcs: ['AC-1'],
    failedAcs: [{ id: 'AC-2', description: 'Login page', reason: 'Not implemented' }],
    suggestions: ['Implement AC-2'],
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(join(HARNESS_DIR, 'specs'), { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'contracts'), { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'reports'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('extractBuiltItems', () => {
  test('returns empty for null spec', () => {
    expect(extractBuiltItems(null, ['AC-1'])).toEqual([]);
  });

  test('returns empty for no passed ACs', () => {
    expect(extractBuiltItems('Some spec', [])).toEqual([]);
  });

  test('extracts AC descriptions from spec', () => {
    const spec = `# Feature Spec
- AC-1: User can create an account
- AC-2: User can log in with email
- AC-3: Dashboard shows user data`;

    const built = extractBuiltItems(spec, ['AC-1', 'AC-3']);
    expect(built).toHaveLength(2);
    expect(built[0]).toContain('AC-1');
    expect(built[0]).toContain('User can create an account');
    expect(built[1]).toContain('AC-3');
    expect(built[1]).toContain('Dashboard shows user data');
  });

  test('returns AC ID when description not found in spec', () => {
    const spec = 'Some spec without AC patterns';
    const built = extractBuiltItems(spec, ['AC-1']);
    expect(built).toEqual(['AC-1']);
  });
});

describe('extractChallenges', () => {
  test('returns empty for no reports', () => {
    expect(extractChallenges([])).toEqual([]);
  });

  test('detects FAIL → PASS transitions', () => {
    const reports: EvalReport[] = [
      makeReport(1, {
        passedAcs: ['AC-1'],
        failedAcs: [{ id: 'AC-2', description: 'Login', reason: 'Missing' }],
      }),
      makeReport(2, {
        passedAcs: ['AC-1', 'AC-2'],
        failedAcs: [],
        verdict: 'PASS',
      }),
    ];

    const challenges = extractChallenges(reports);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].description).toContain('AC-2');
    expect(challenges[0].description).toContain('round 1');
    expect(challenges[0].resolvedInRound).toBe(2);
  });

  test('no challenges when everything passes first round', () => {
    const reports: EvalReport[] = [
      makeReport(1, {
        passedAcs: ['AC-1', 'AC-2'],
        failedAcs: [],
        verdict: 'PASS',
      }),
    ];

    expect(extractChallenges(reports)).toEqual([]);
  });
});

describe('extractPatterns', () => {
  test('returns empty for null spec', () => {
    expect(extractPatterns(null)).toEqual([]);
  });

  test('extracts tech patterns from spec', () => {
    const spec = `# Feature Spec
Using TypeScript with React for the frontend.
Using Express for the backend API.
Framework: Next.js`;

    const patterns = extractPatterns(spec);
    expect(patterns.length).toBeGreaterThan(0);
  });

  test('deduplicates patterns', () => {
    const spec = `Using TypeScript for types.
Using TypeScript for validation.`;

    const patterns = extractPatterns(spec);
    const tsCount = patterns.filter((p) => p === 'TypeScript').length;
    // Should be at most 1 after dedup
    expect(tsCount).toBeLessThanOrEqual(1);
  });
});

describe('buildRetrospective', () => {
  test('builds retro from artifacts on disk', () => {
    // Write a spec
    writeFileSync(
      join(HARNESS_DIR, 'specs', 'sprint-123.md'),
      `# Feature Spec
- AC-1: User registration using React
- AC-2: Login page
- AC-3: Dashboard`,
      'utf-8'
    );

    // Write reports
    writeFileSync(
      join(HARNESS_DIR, 'reports', 'sprint-123-round-1.json'),
      JSON.stringify(makeReport(1, {
        passedAcs: ['AC-1'],
        failedAcs: [
          { id: 'AC-2', description: 'Login page', reason: 'Not implemented' },
          { id: 'AC-3', description: 'Dashboard', reason: 'Not started' },
        ],
      })),
      'utf-8'
    );
    writeFileSync(
      join(HARNESS_DIR, 'reports', 'sprint-123-round-2.json'),
      JSON.stringify(makeReport(2, {
        passedAcs: ['AC-1', 'AC-2'],
        failedAcs: [{ id: 'AC-3', description: 'Dashboard', reason: 'Incomplete' }],
      })),
      'utf-8'
    );
    writeFileSync(
      join(HARNESS_DIR, 'reports', 'sprint-123-round-3.json'),
      JSON.stringify(makeReport(3, {
        passedAcs: ['AC-1', 'AC-2', 'AC-3'],
        failedAcs: [],
        verdict: 'PASS',
      })),
      'utf-8'
    );

    const state = makeState();
    const retro = buildRetrospective(HARNESS_DIR, state, 0.15, 60000);

    expect(retro.sprintId).toBe('sprint-123');
    expect(retro.prompt).toBe('Build an MBTI quiz app');
    expect(retro.verdict).toBe('PASS');
    expect(retro.rounds).toBe(3);
    expect(retro.costUsd).toBe(0.15);
    expect(retro.passedAcs).toEqual(['AC-1', 'AC-2', 'AC-3']);
    expect(retro.built.length).toBeGreaterThan(0);
    expect(retro.deferred).toEqual([]); // no failed ACs in final report
  });

  test('captures deferred items from failed ACs in final report', () => {
    writeFileSync(
      join(HARNESS_DIR, 'specs', 'sprint-123.md'),
      '# Spec\n- AC-1: Done\n- AC-2: Not done',
      'utf-8'
    );
    writeFileSync(
      join(HARNESS_DIR, 'reports', 'sprint-123-round-3.json'),
      JSON.stringify(makeReport(3, {
        verdict: 'PARTIAL',
        passedAcs: ['AC-1'],
        failedAcs: [{ id: 'AC-2', description: 'Login page', reason: 'Too complex' }],
      })),
      'utf-8'
    );

    const state = makeState({ lastEvalVerdict: 'PARTIAL' });
    const retro = buildRetrospective(HARNESS_DIR, state, 0.1, 50000);

    expect(retro.verdict).toBe('PARTIAL');
    expect(retro.deferred.length).toBeGreaterThan(0);
    expect(retro.deferred[0]).toContain('AC-2');
    expect(retro.failedAcs).toContain('AC-2');
  });

  test('handles missing artifacts gracefully', () => {
    // No spec, no reports, no decisions
    const state = makeState({ previouslyPassedAcs: [] });
    const retro = buildRetrospective(HARNESS_DIR, state, 0, 1000);

    expect(retro.sprintId).toBe('sprint-123');
    expect(retro.built).toEqual([]);
    expect(retro.challenges).toEqual([]);
    expect(retro.patterns).toEqual([]);
    expect(retro.decisions).toEqual([]);
  });
});

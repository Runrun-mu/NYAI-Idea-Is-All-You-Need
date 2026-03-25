import { describe, test, expect } from 'bun:test';
import { canTransition, transition, nextStateAfterEval } from '../src/core/state-machine';
import type { State } from '../src/types/state';

describe('canTransition', () => {
  test('IDLE → PLANNING is valid', () => {
    expect(canTransition('IDLE', 'PLANNING')).toBe(true);
  });

  test('IDLE → ARCHITECTING is valid', () => {
    expect(canTransition('IDLE', 'ARCHITECTING')).toBe(true);
  });

  test('ARCHITECTING → PLANNING is valid', () => {
    expect(canTransition('ARCHITECTING', 'PLANNING')).toBe(true);
  });

  test('ARCHITECTING → ERROR is valid', () => {
    expect(canTransition('ARCHITECTING', 'ERROR')).toBe(true);
  });

  test('ARCHITECTING → DONE is invalid', () => {
    expect(canTransition('ARCHITECTING', 'DONE')).toBe(false);
  });

  test('PLANNING → CONTRACTING is valid', () => {
    expect(canTransition('PLANNING', 'CONTRACTING')).toBe(true);
  });

  test('CONTRACTING → GENERATING is valid', () => {
    expect(canTransition('CONTRACTING', 'GENERATING')).toBe(true);
  });

  test('GENERATING → EVALUATING is valid', () => {
    expect(canTransition('GENERATING', 'EVALUATING')).toBe(true);
  });

  test('EVALUATING → GENERATING is valid (retry loop)', () => {
    expect(canTransition('EVALUATING', 'GENERATING')).toBe(true);
  });

  test('EVALUATING → DONE is valid', () => {
    expect(canTransition('EVALUATING', 'DONE')).toBe(true);
  });

  test('EVALUATING → BLOCKED is valid', () => {
    expect(canTransition('EVALUATING', 'BLOCKED')).toBe(true);
  });

  test('IDLE → DONE is invalid', () => {
    expect(canTransition('IDLE', 'DONE')).toBe(false);
  });

  test('GENERATING → DONE is invalid', () => {
    expect(canTransition('GENERATING', 'DONE')).toBe(false);
  });

  test('DONE → PLANNING is invalid', () => {
    expect(canTransition('DONE', 'PLANNING')).toBe(false);
  });

  test('any state → ERROR is valid (except DONE/ERROR)', () => {
    const statesWithError: State[] = ['ARCHITECTING', 'PLANNING', 'CONTRACTING', 'GENERATING', 'EVALUATING', 'BLOCKED'];
    for (const s of statesWithError) {
      expect(canTransition(s, 'ERROR')).toBe(true);
    }
  });
});

describe('transition', () => {
  test('returns valid StateHistoryEntry', () => {
    const entry = transition('IDLE', 'PLANNING', 'starting');
    expect(entry.from).toBe('IDLE');
    expect(entry.to).toBe('PLANNING');
    expect(entry.reason).toBe('starting');
    expect(typeof entry.timestamp).toBe('number');
  });

  test('throws on invalid transition', () => {
    expect(() => transition('IDLE', 'DONE')).toThrow('Invalid state transition');
  });
});

describe('nextStateAfterEval', () => {
  test('PASS → DONE', () => {
    expect(nextStateAfterEval('PASS', 1, 10, false)).toBe('DONE');
  });

  test('FAIL at max rounds → DONE', () => {
    expect(nextStateAfterEval('FAIL', 10, 10, false)).toBe('DONE');
  });

  test('FAIL with stuck → BLOCKED', () => {
    expect(nextStateAfterEval('FAIL', 3, 10, true)).toBe('BLOCKED');
  });

  test('FAIL normal → GENERATING (retry)', () => {
    expect(nextStateAfterEval('FAIL', 3, 10, false)).toBe('GENERATING');
  });

  test('PARTIAL normal → GENERATING (retry)', () => {
    expect(nextStateAfterEval('PARTIAL', 2, 10, false)).toBe('GENERATING');
  });
});

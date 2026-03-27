import { describe, test, expect } from 'bun:test';
import { isTimeoutResult, buildTimeoutContext } from '../src/agents/timeout-handler';
import type { AgentResult } from '../src/types/agent';

describe('isTimeoutResult', () => {
  test('returns true when timedOut is true', () => {
    const result: AgentResult = {
      role: 'generator',
      success: false,
      output: '',
      costUsd: 0,
      durationMs: 600000,
      numTurns: 0,
      sessionId: '',
      timedOut: true,
    };
    expect(isTimeoutResult(result)).toBe(true);
  });

  test('returns false when timedOut is false', () => {
    const result: AgentResult = {
      role: 'generator',
      success: true,
      output: 'done',
      costUsd: 0.05,
      durationMs: 30000,
      numTurns: 5,
      sessionId: 'abc',
      timedOut: false,
    };
    expect(isTimeoutResult(result)).toBe(false);
  });

  test('returns false when timedOut is undefined', () => {
    const result: AgentResult = {
      role: 'generator',
      success: true,
      output: 'done',
      costUsd: 0.05,
      durationMs: 30000,
      numTurns: 5,
      sessionId: 'abc',
    };
    expect(isTimeoutResult(result)).toBe(false);
  });
});

describe('buildTimeoutContext', () => {
  test('builds context with correct fields', () => {
    const result: AgentResult = {
      role: 'generator',
      success: false,
      output: 'partial work',
      costUsd: 0.03,
      durationMs: 600000,
      numTurns: 10,
      sessionId: 'timeout-1',
      timedOut: true,
      partialOutput: 'partial work output',
    };

    // Use a non-git directory so getModifiedFiles returns []
    const ctx = buildTimeoutContext(result, 1, '/tmp', null, 2, 1200000);

    expect(ctx.round).toBe(1);
    expect(ctx.durationMs).toBe(600000);
    expect(ctx.retryCount).toBe(2);
    expect(ctx.totalTimeSpentMs).toBe(1200000);
    expect(ctx.partialOutput).toBe('partial work output');
    expect(Array.isArray(ctx.filesModified)).toBe(true);
  });

  test('uses output when partialOutput is undefined', () => {
    const result: AgentResult = {
      role: 'generator',
      success: false,
      output: 'some output',
      costUsd: 0,
      durationMs: 300000,
      numTurns: 0,
      sessionId: '',
      timedOut: true,
    };

    const ctx = buildTimeoutContext(result, 2, '/tmp', null, 0, 300000);
    expect(ctx.partialOutput).toBe('some output');
  });

  test('returns empty filesModified when beforeRef is null', () => {
    const result: AgentResult = {
      role: 'generator',
      success: false,
      output: '',
      costUsd: 0,
      durationMs: 100000,
      numTurns: 0,
      sessionId: '',
      timedOut: true,
    };

    const ctx = buildTimeoutContext(result, 1, '/tmp', null, 0, 100000);
    expect(ctx.filesModified).toEqual([]);
  });
});

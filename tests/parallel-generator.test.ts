import { describe, test, expect } from 'bun:test';
import { splitWork, mergeParallelResults } from '../src/agents/parallel-generator';
import type { AgentResult } from '../src/types/agent';

describe('splitWork', () => {
  test('splits ACs evenly into groups', () => {
    const acIds = ['AC-1', 'AC-2', 'AC-3', 'AC-4'];
    const groups = splitWork(acIds, 2);
    expect(groups.length).toBe(2);
    expect(groups[0]).toEqual(['AC-1', 'AC-3']);
    expect(groups[1]).toEqual(['AC-2', 'AC-4']);
  });

  test('handles more generators than ACs', () => {
    const acIds = ['AC-1', 'AC-2'];
    const groups = splitWork(acIds, 5);
    expect(groups.length).toBe(2); // Only 2 groups since only 2 ACs
    expect(groups[0]).toEqual(['AC-1']);
    expect(groups[1]).toEqual(['AC-2']);
  });

  test('handles single AC', () => {
    const groups = splitWork(['AC-1'], 3);
    expect(groups.length).toBe(1);
    expect(groups[0]).toEqual(['AC-1']);
  });

  test('handles single generator', () => {
    const groups = splitWork(['AC-1', 'AC-2', 'AC-3'], 1);
    expect(groups.length).toBe(1);
    expect(groups[0]).toEqual(['AC-1', 'AC-2', 'AC-3']);
  });

  test('round-robin distributes unevenly', () => {
    const acIds = ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5'];
    const groups = splitWork(acIds, 3);
    expect(groups.length).toBe(3);
    expect(groups[0]).toEqual(['AC-1', 'AC-4']);
    expect(groups[1]).toEqual(['AC-2', 'AC-5']);
    expect(groups[2]).toEqual(['AC-3']);
  });

  test('handles empty AC list', () => {
    const groups = splitWork([], 3);
    expect(groups.length).toBe(0);
  });
});

describe('mergeParallelResults', () => {
  const makeResult = (overrides: Partial<AgentResult> = {}): AgentResult => ({
    role: 'generator',
    success: true,
    output: 'output',
    costUsd: 0.01,
    durationMs: 10000,
    numTurns: 5,
    sessionId: 'test',
    ...overrides,
  });

  test('merges costs and durations correctly', () => {
    const results = [
      makeResult({ costUsd: 0.03, durationMs: 5000, numTurns: 3 }),
      makeResult({ costUsd: 0.05, durationMs: 8000, numTurns: 7 }),
    ];
    const merged = mergeParallelResults(results);
    expect(merged.costUsd).toBe(0.08);
    expect(merged.durationMs).toBe(8000); // max duration
    expect(merged.numTurns).toBe(10); // sum of turns
  });

  test('success is true only if all succeed', () => {
    const results = [
      makeResult({ success: true }),
      makeResult({ success: false, error: 'failed' }),
    ];
    const merged = mergeParallelResults(results);
    expect(merged.success).toBe(false);
    expect(merged.error).toContain('failed');
  });

  test('all success results in success', () => {
    const results = [
      makeResult({ success: true }),
      makeResult({ success: true }),
    ];
    const merged = mergeParallelResults(results);
    expect(merged.success).toBe(true);
    expect(merged.error).toBeUndefined();
  });

  test('detects any timeout', () => {
    const results = [
      makeResult({ timedOut: false }),
      makeResult({ timedOut: true, partialOutput: 'partial' }),
    ];
    const merged = mergeParallelResults(results);
    expect(merged.timedOut).toBe(true);
    expect(merged.partialOutput).toContain('partial');
  });

  test('combines outputs from all generators', () => {
    const results = [
      makeResult({ output: 'gen1 output' }),
      makeResult({ output: 'gen2 output' }),
    ];
    const merged = mergeParallelResults(results);
    expect(merged.output).toContain('Generator 1');
    expect(merged.output).toContain('gen1 output');
    expect(merged.output).toContain('Generator 2');
    expect(merged.output).toContain('gen2 output');
  });

  test('role is always generator', () => {
    const merged = mergeParallelResults([makeResult()]);
    expect(merged.role).toBe('generator');
  });
});

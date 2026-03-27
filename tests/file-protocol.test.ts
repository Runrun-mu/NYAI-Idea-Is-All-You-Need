import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  ensureHarnessDir,
  parseEvalVerdict,
  isStuck,
  readReport,
  readSpec,
  readContract,
} from '../src/protocol/file-protocol';

const TEST_DIR = join(import.meta.dir, '.test-harness');
const HARNESS_DIR = join(TEST_DIR, '.harness');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('ensureHarnessDir', () => {
  test('creates .harness with subdirectories', () => {
    ensureHarnessDir(TEST_DIR);
    expect(existsSync(join(HARNESS_DIR, 'specs'))).toBe(true);
    expect(existsSync(join(HARNESS_DIR, 'contracts'))).toBe(true);
    expect(existsSync(join(HARNESS_DIR, 'reports'))).toBe(true);
    expect(existsSync(join(HARNESS_DIR, 'test-plans'))).toBe(true);
  });
});

describe('parseEvalVerdict', () => {
  test('reads verdict from report file', () => {
    ensureHarnessDir(TEST_DIR);
    const report = {
      verdict: 'PASS',
      summary: 'All good',
      passedAcs: ['AC-1', 'AC-2'],
      failedAcs: [],
      suggestions: [],
      score: 100,
    };
    writeFileSync(
      join(HARNESS_DIR, 'reports', 'sprint-1-round-1.json'),
      JSON.stringify(report),
      'utf-8'
    );

    const result = parseEvalVerdict(HARNESS_DIR, 'sprint-1', 1);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('PASS');
    expect(result!.report.passedAcs).toEqual(['AC-1', 'AC-2']);
  });

  test('parses verdict from agent output as fallback', () => {
    ensureHarnessDir(TEST_DIR);
    const agentOutput = `Some text before {"verdict": "FAIL", "summary": "Issues found", "passedAcs": [], "failedAcs": [{"id": "AC-1", "description": "test", "reason": "broken"}], "suggestions": ["fix it"]} some text after`;

    const result = parseEvalVerdict(HARNESS_DIR, 'sprint-2', 1, agentOutput);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('FAIL');
    expect(result!.report.failedAcs).toHaveLength(1);
  });

  test('returns null when no verdict found', () => {
    ensureHarnessDir(TEST_DIR);
    const result = parseEvalVerdict(HARNESS_DIR, 'sprint-3', 1);
    expect(result).toBeNull();
  });
});

describe('isStuck', () => {
  test('returns true for identical failed AC sets', () => {
    expect(isStuck(['AC-1', 'AC-2'], ['AC-1', 'AC-2'])).toBe(true);
    expect(isStuck(['AC-2', 'AC-1'], ['AC-1', 'AC-2'])).toBe(true);
  });

  test('returns false for different failed AC sets', () => {
    expect(isStuck(['AC-1', 'AC-3'], ['AC-1', 'AC-2'])).toBe(false);
  });

  test('returns false for different sized sets', () => {
    expect(isStuck(['AC-1'], ['AC-1', 'AC-2'])).toBe(false);
  });

  test('returns false for empty sets', () => {
    expect(isStuck([], ['AC-1'])).toBe(false);
    expect(isStuck(['AC-1'], [])).toBe(false);
    expect(isStuck([], [])).toBe(false);
  });
});

describe('readSpec / readContract', () => {
  test('returns null for non-existent files', () => {
    ensureHarnessDir(TEST_DIR);
    expect(readSpec(HARNESS_DIR, 'nonexistent')).toBeNull();
    expect(readContract(HARNESS_DIR, 'nonexistent')).toBeNull();
  });

  test('reads existing spec', () => {
    ensureHarnessDir(TEST_DIR);
    writeFileSync(join(HARNESS_DIR, 'specs', 'sprint-1.md'), '# My Spec', 'utf-8');
    expect(readSpec(HARNESS_DIR, 'sprint-1')).toBe('# My Spec');
  });
});

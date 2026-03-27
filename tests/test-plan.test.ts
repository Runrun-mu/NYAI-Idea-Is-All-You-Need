import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ensureHarnessDir,
  getTestPlanPath,
  readTestPlan,
} from '../src/protocol/file-protocol';
import type { TestPlan, TestCase, TestStep } from '../src/types/protocol';

const TEST_DIR = join(import.meta.dir, '.test-plan');
const HARNESS_DIR = join(TEST_DIR, '.harness');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('ensureHarnessDir — test-plans subdirectory', () => {
  test('creates test-plans subdirectory', () => {
    ensureHarnessDir(TEST_DIR);
    expect(existsSync(join(HARNESS_DIR, 'test-plans'))).toBe(true);
  });
});

describe('getTestPlanPath', () => {
  test('returns correct path', () => {
    const path = getTestPlanPath(HARNESS_DIR, 'sprint-1');
    expect(path).toBe(join(HARNESS_DIR, 'test-plans', 'sprint-1.json'));
  });
});

describe('readTestPlan', () => {
  test('returns null when no test plan exists', () => {
    ensureHarnessDir(TEST_DIR);
    expect(readTestPlan(HARNESS_DIR, 'nonexistent')).toBeNull();
  });

  test('reads existing test plan', () => {
    ensureHarnessDir(TEST_DIR);
    const testPlan: TestPlan = {
      sprintId: 'sprint-1',
      testCases: [
        {
          id: 'TC-1',
          acId: 'AC-1',
          title: 'Homepage returns 200',
          type: 'e2e',
          steps: [
            {
              action: 'Request homepage',
              expected: 'Status 200',
              command: 'curl -s -o /dev/null -w "%{http_code}" localhost:3000',
            },
          ],
          expectedResult: '200',
          automatable: true,
        },
      ],
    };
    writeFileSync(
      join(HARNESS_DIR, 'test-plans', 'sprint-1.json'),
      JSON.stringify(testPlan),
      'utf-8'
    );

    const result = readTestPlan(HARNESS_DIR, 'sprint-1');
    expect(result).not.toBeNull();
    expect(result!.sprintId).toBe('sprint-1');
    expect(result!.testCases).toHaveLength(1);
    expect(result!.testCases[0].id).toBe('TC-1');
    expect(result!.testCases[0].acId).toBe('AC-1');
    expect(result!.testCases[0].type).toBe('e2e');
    expect(result!.testCases[0].automatable).toBe(true);
    expect(result!.testCases[0].steps[0].command).toContain('curl');
  });

  test('reads test plan with multiple test cases', () => {
    ensureHarnessDir(TEST_DIR);
    const testPlan: TestPlan = {
      sprintId: 'sprint-2',
      testCases: [
        {
          id: 'TC-1',
          acId: 'AC-1',
          title: 'Unit test for calculator add',
          type: 'unit',
          steps: [{ action: 'Run unit test', expected: 'Pass', command: 'bun test calc.test.ts' }],
          expectedResult: 'PASS',
          automatable: true,
        },
        {
          id: 'TC-2',
          acId: 'AC-2',
          title: 'Integration test for API',
          type: 'integration',
          steps: [
            { action: 'Start server', expected: 'Server up' },
            { action: 'Call API', expected: '200 response', command: 'curl -s localhost:3000/api/calc?a=1&b=2' },
          ],
          expectedResult: '{"result":3}',
          automatable: true,
        },
        {
          id: 'TC-3',
          acId: 'AC-3',
          title: 'Visual layout check',
          type: 'e2e',
          steps: [{ action: 'Open browser and check layout', expected: 'Layout is correct' }],
          expectedResult: 'Layout matches design',
          automatable: false,
        },
      ],
    };
    writeFileSync(
      join(HARNESS_DIR, 'test-plans', 'sprint-2.json'),
      JSON.stringify(testPlan),
      'utf-8'
    );

    const result = readTestPlan(HARNESS_DIR, 'sprint-2');
    expect(result).not.toBeNull();
    expect(result!.testCases).toHaveLength(3);
    expect(result!.testCases[0].type).toBe('unit');
    expect(result!.testCases[1].type).toBe('integration');
    expect(result!.testCases[2].automatable).toBe(false);
  });
});

describe('TestPlan type structure', () => {
  test('TestCase has all required fields', () => {
    const tc: TestCase = {
      id: 'TC-1',
      acId: 'AC-1',
      title: 'Test',
      type: 'unit',
      steps: [],
      expectedResult: 'pass',
      automatable: true,
    };
    expect(tc.id).toBe('TC-1');
    expect(tc.acId).toBe('AC-1');
    expect(tc.type).toBe('unit');
  });

  test('TestStep command is optional', () => {
    const step: TestStep = {
      action: 'Do something',
      expected: 'Something happens',
    };
    expect(step.command).toBeUndefined();

    const stepWithCmd: TestStep = {
      action: 'Run test',
      expected: 'Pass',
      command: 'bun test',
    };
    expect(stepWithCmd.command).toBe('bun test');
  });
});

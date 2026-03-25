import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  appendProgress,
  readProgress,
  getProgressPath,
} from '../src/protocol/progress-logger';

const TEST_DIR = join(import.meta.dir, '.test-progress');
const HARNESS_DIR = join(TEST_DIR, '.harness');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(HARNESS_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('appendProgress', () => {
  test('creates progress file and appends entry', () => {
    appendProgress(HARNESS_DIR, 'state:change', 'IDLE → PLANNING');
    const path = getProgressPath(HARNESS_DIR);
    expect(existsSync(path)).toBe(true);
  });

  test('appends multiple entries', () => {
    appendProgress(HARNESS_DIR, 'state:change', 'IDLE → PLANNING');
    appendProgress(HARNESS_DIR, 'agent:start', 'planner started');
    appendProgress(HARNESS_DIR, 'agent:done', 'planner done', { costUsd: 0.05 });

    const entries = readProgress(HARNESS_DIR);
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe('state:change');
    expect(entries[1].type).toBe('agent:start');
    expect(entries[2].type).toBe('agent:done');
    expect(entries[2].data).toEqual({ costUsd: 0.05 });
  });
});

describe('readProgress', () => {
  test('returns empty array for non-existent file', () => {
    expect(readProgress(HARNESS_DIR)).toEqual([]);
  });

  test('reads all entries', () => {
    appendProgress(HARNESS_DIR, 'test', 'entry 1');
    appendProgress(HARNESS_DIR, 'test', 'entry 2');

    const entries = readProgress(HARNESS_DIR);
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe('entry 1');
    expect(entries[1].message).toBe('entry 2');
    expect(typeof entries[0].timestamp).toBe('number');
  });
});

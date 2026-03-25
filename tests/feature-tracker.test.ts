import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  readFeatureList,
  writeFeatureList,
  updateFeatureStatus,
  getNextPendingFeature,
  createFeatureList,
  hasFeatureList,
} from '../src/protocol/feature-tracker';
import type { FeatureList } from '../src/types/protocol';

const TEST_DIR = join(import.meta.dir, '.test-features');
const HARNESS_DIR = join(TEST_DIR, '.harness');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(HARNESS_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('hasFeatureList', () => {
  test('returns false when no features.json', () => {
    expect(hasFeatureList(HARNESS_DIR)).toBe(false);
  });

  test('returns true when features.json exists', () => {
    createFeatureList(HARNESS_DIR, 'test', [
      { id: 'F-1', title: 'Feature 1', description: 'Test', acceptanceCriteria: ['AC-1'] },
    ]);
    expect(hasFeatureList(HARNESS_DIR)).toBe(true);
  });
});

describe('createFeatureList', () => {
  test('creates feature list with pending status', () => {
    const list = createFeatureList(HARNESS_DIR, 'Build an app', [
      { id: 'F-1', title: 'Auth', description: 'Authentication', acceptanceCriteria: ['AC-1'] },
      { id: 'F-2', title: 'API', description: 'REST API', acceptanceCriteria: ['AC-2', 'AC-3'] },
    ]);

    expect(list.parentPrompt).toBe('Build an app');
    expect(list.features).toHaveLength(2);
    expect(list.features[0].status).toBe('pending');
    expect(list.features[1].status).toBe('pending');
  });
});

describe('readFeatureList / writeFeatureList', () => {
  test('returns null for non-existent file', () => {
    expect(readFeatureList(HARNESS_DIR)).toBeNull();
  });

  test('roundtrips correctly', () => {
    const list: FeatureList = {
      parentPrompt: 'test',
      features: [
        {
          id: 'F-1',
          title: 'Feature 1',
          description: 'Desc',
          acceptanceCriteria: ['AC-1'],
          status: 'pending',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    writeFeatureList(HARNESS_DIR, list);
    const read = readFeatureList(HARNESS_DIR);
    expect(read).not.toBeNull();
    expect(read!.features[0].title).toBe('Feature 1');
  });
});

describe('updateFeatureStatus', () => {
  test('updates status of a feature', () => {
    createFeatureList(HARNESS_DIR, 'test', [
      { id: 'F-1', title: 'Feature 1', description: 'Desc', acceptanceCriteria: ['AC-1'] },
      { id: 'F-2', title: 'Feature 2', description: 'Desc', acceptanceCriteria: ['AC-2'] },
    ]);

    updateFeatureStatus(HARNESS_DIR, 'F-1', 'in_progress', 'sprint-1-F1');
    let list = readFeatureList(HARNESS_DIR);
    expect(list!.features[0].status).toBe('in_progress');
    expect(list!.features[0].sprintId).toBe('sprint-1-F1');

    updateFeatureStatus(HARNESS_DIR, 'F-1', 'done');
    list = readFeatureList(HARNESS_DIR);
    expect(list!.features[0].status).toBe('done');
    expect(list!.features[0].completedAt).toBeDefined();
  });

  test('returns null for non-existent feature', () => {
    createFeatureList(HARNESS_DIR, 'test', [
      { id: 'F-1', title: 'Feature 1', description: 'Desc', acceptanceCriteria: ['AC-1'] },
    ]);

    const result = updateFeatureStatus(HARNESS_DIR, 'F-99', 'done');
    expect(result).toBeNull();
  });
});

describe('getNextPendingFeature', () => {
  test('returns null when no features', () => {
    expect(getNextPendingFeature(HARNESS_DIR)).toBeNull();
  });

  test('returns first pending feature', () => {
    createFeatureList(HARNESS_DIR, 'test', [
      { id: 'F-1', title: 'Done Feature', description: 'Desc', acceptanceCriteria: ['AC-1'] },
      { id: 'F-2', title: 'Pending Feature', description: 'Desc', acceptanceCriteria: ['AC-2'] },
    ]);
    updateFeatureStatus(HARNESS_DIR, 'F-1', 'done');

    const next = getNextPendingFeature(HARNESS_DIR);
    expect(next).not.toBeNull();
    expect(next!.id).toBe('F-2');
    expect(next!.title).toBe('Pending Feature');
  });

  test('returns null when all features done', () => {
    createFeatureList(HARNESS_DIR, 'test', [
      { id: 'F-1', title: 'Feature 1', description: 'Desc', acceptanceCriteria: ['AC-1'] },
    ]);
    updateFeatureStatus(HARNESS_DIR, 'F-1', 'done');

    expect(getNextPendingFeature(HARNESS_DIR)).toBeNull();
  });
});

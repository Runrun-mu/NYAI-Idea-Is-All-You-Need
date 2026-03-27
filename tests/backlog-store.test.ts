import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  readBacklog,
  writeBacklog,
  addBacklogItem,
  getNextItem,
  markItemInProgress,
  markItemDone,
  markItemCancelled,
  listPendingItems,
  listAllItems,
} from '../src/protocol/backlog-store';
import type { BacklogItem } from '../src/types/backlog';

const TEST_DIR = join(import.meta.dir, '.test-backlog');
const HARNESS_DIR = join(TEST_DIR, '.harness');

beforeEach(() => {
  mkdirSync(HARNESS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('readBacklog / writeBacklog', () => {
  test('returns empty backlog for non-existent file', () => {
    const backlog = readBacklog(HARNESS_DIR);
    expect(backlog.version).toBe(1);
    expect(backlog.items).toEqual([]);
  });

  test('round-trips backlog', () => {
    const backlog = { version: 1 as const, items: [] };
    writeBacklog(HARNESS_DIR, backlog);
    const loaded = readBacklog(HARNESS_DIR);
    expect(loaded.version).toBe(1);
    expect(loaded.items).toEqual([]);
  });
});

describe('addBacklogItem', () => {
  test('adds item with generated id and pending status', () => {
    const item = addBacklogItem(HARNESS_DIR, {
      type: 'feature',
      title: 'Add dark mode',
      priority: 'medium',
      submittedBy: 'user',
    });

    expect(item.id).toMatch(/^bl-\d+/);
    expect(item.status).toBe('pending');
    expect(item.title).toBe('Add dark mode');
    expect(item.type).toBe('feature');
    expect(item.priority).toBe('medium');
  });

  test('persists to disk', () => {
    addBacklogItem(HARNESS_DIR, {
      type: 'bug',
      title: 'Fix login flicker',
      priority: 'critical',
    });

    const backlog = readBacklog(HARNESS_DIR);
    expect(backlog.items).toHaveLength(1);
    expect(backlog.items[0].title).toBe('Fix login flicker');
  });

  test('appends multiple items', () => {
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'A', priority: 'low' });
    addBacklogItem(HARNESS_DIR, { type: 'bug', title: 'B', priority: 'high' });
    addBacklogItem(HARNESS_DIR, { type: 'chore', title: 'C', priority: 'medium' });

    const backlog = readBacklog(HARNESS_DIR);
    expect(backlog.items).toHaveLength(3);
  });
});

describe('getNextItem', () => {
  test('returns null for empty backlog', () => {
    expect(getNextItem(HARNESS_DIR)).toBeNull();
  });

  test('returns highest priority pending item', () => {
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Low', priority: 'low' });
    addBacklogItem(HARNESS_DIR, { type: 'bug', title: 'Critical', priority: 'critical' });
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'High', priority: 'high' });

    const next = getNextItem(HARNESS_DIR);
    expect(next).not.toBeNull();
    expect(next!.title).toBe('Critical');
    expect(next!.priority).toBe('critical');
  });

  test('returns oldest item within same priority', () => {
    // Add items with small delay
    const item1 = addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'First', priority: 'high' });
    const item2 = addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Second', priority: 'high' });

    const next = getNextItem(HARNESS_DIR);
    expect(next!.id).toBe(item1.id);
  });

  test('skips non-pending items', () => {
    const item = addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Done', priority: 'critical' });
    markItemDone(HARNESS_DIR, item.id);
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Pending', priority: 'low' });

    const next = getNextItem(HARNESS_DIR);
    expect(next!.title).toBe('Pending');
  });
});

describe('markItemInProgress', () => {
  test('updates status and sprintId', () => {
    const item = addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Test', priority: 'medium' });
    markItemInProgress(HARNESS_DIR, item.id, 'sprint-123');

    const backlog = readBacklog(HARNESS_DIR);
    const updated = backlog.items.find((i) => i.id === item.id)!;
    expect(updated.status).toBe('in_progress');
    expect(updated.sprintId).toBe('sprint-123');
  });
});

describe('markItemDone', () => {
  test('updates status to done', () => {
    const item = addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Test', priority: 'medium' });
    markItemDone(HARNESS_DIR, item.id);

    const backlog = readBacklog(HARNESS_DIR);
    const updated = backlog.items.find((i) => i.id === item.id)!;
    expect(updated.status).toBe('done');
  });
});

describe('markItemCancelled', () => {
  test('updates status to cancelled', () => {
    const item = addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Test', priority: 'medium' });
    markItemCancelled(HARNESS_DIR, item.id, 'Not needed');

    const backlog = readBacklog(HARNESS_DIR);
    const updated = backlog.items.find((i) => i.id === item.id)!;
    expect(updated.status).toBe('cancelled');
    expect(updated.source).toContain('Not needed');
  });
});

describe('listPendingItems', () => {
  test('returns only pending items sorted by priority', () => {
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Low', priority: 'low' });
    const doneItem = addBacklogItem(HARNESS_DIR, { type: 'bug', title: 'Done', priority: 'critical' });
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'High', priority: 'high' });
    markItemDone(HARNESS_DIR, doneItem.id);

    const pending = listPendingItems(HARNESS_DIR);
    expect(pending).toHaveLength(2);
    expect(pending[0].title).toBe('High');
    expect(pending[1].title).toBe('Low');
  });
});

describe('listAllItems', () => {
  test('returns all items including done/cancelled', () => {
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Pending', priority: 'low' });
    const done = addBacklogItem(HARNESS_DIR, { type: 'bug', title: 'Done', priority: 'high' });
    markItemDone(HARNESS_DIR, done.id);

    const all = listAllItems(HARNESS_DIR);
    expect(all).toHaveLength(2);
  });
});

describe('priority ordering', () => {
  test('critical > high > medium > low', () => {
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Low', priority: 'low' });
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Medium', priority: 'medium' });
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'Critical', priority: 'critical' });
    addBacklogItem(HARNESS_DIR, { type: 'feature', title: 'High', priority: 'high' });

    const pending = listPendingItems(HARNESS_DIR);
    expect(pending.map((i) => i.title)).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });
});

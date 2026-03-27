import type { Backlog, BacklogItem } from '../types/backlog';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const BACKLOG_FILE = 'backlog.json';

let _idCounter = 0;

const PRIORITY_ORDER: Record<BacklogItem['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Read / Write ──────────────────────────────────────────────────

export function getBacklogPath(harnessDir: string): string {
  return join(harnessDir, BACKLOG_FILE);
}

export function readBacklog(harnessDir: string): Backlog {
  try {
    const raw = readFileSync(getBacklogPath(harnessDir), 'utf-8');
    return JSON.parse(raw) as Backlog;
  } catch {
    return { version: 1, items: [] };
  }
}

export function writeBacklog(harnessDir: string, backlog: Backlog): void {
  const path = getBacklogPath(harnessDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(backlog, null, 2), 'utf-8');
}

// ─── CRUD Operations ──────────────────────────────────────────────

export function addBacklogItem(
  harnessDir: string,
  item: Omit<BacklogItem, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): BacklogItem {
  const backlog = readBacklog(harnessDir);
  const now = Date.now();

  const newItem: BacklogItem = {
    id: `bl-${now}-${_idCounter++}`,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...item,
  };

  backlog.items.push(newItem);
  writeBacklog(harnessDir, backlog);
  return newItem;
}

export function getNextItem(harnessDir: string): BacklogItem | null {
  const backlog = readBacklog(harnessDir);

  const pending = backlog.items
    .filter((item) => item.status === 'pending')
    .sort((a, b) => {
      // Sort by priority first, then by creation time
      const priDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priDiff !== 0) return priDiff;
      return a.createdAt - b.createdAt;
    });

  return pending.length > 0 ? pending[0] : null;
}

export function markItemInProgress(
  harnessDir: string,
  itemId: string,
  sprintId: string
): void {
  const backlog = readBacklog(harnessDir);
  const item = backlog.items.find((i) => i.id === itemId);
  if (item) {
    item.status = 'in_progress';
    item.sprintId = sprintId;
    item.updatedAt = Date.now();
    writeBacklog(harnessDir, backlog);
  }
}

export function markItemDone(harnessDir: string, itemId: string): void {
  const backlog = readBacklog(harnessDir);
  const item = backlog.items.find((i) => i.id === itemId);
  if (item) {
    item.status = 'done';
    item.updatedAt = Date.now();
    writeBacklog(harnessDir, backlog);
  }
}

export function markItemCancelled(
  harnessDir: string,
  itemId: string,
  reason?: string
): void {
  const backlog = readBacklog(harnessDir);
  const item = backlog.items.find((i) => i.id === itemId);
  if (item) {
    item.status = 'cancelled';
    item.updatedAt = Date.now();
    if (reason) {
      item.source = (item.source ? item.source + ' | ' : '') + `Cancelled: ${reason}`;
    }
    writeBacklog(harnessDir, backlog);
  }
}

export function listPendingItems(harnessDir: string): BacklogItem[] {
  const backlog = readBacklog(harnessDir);
  return backlog.items
    .filter((item) => item.status === 'pending')
    .sort((a, b) => {
      const priDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priDiff !== 0) return priDiff;
      return a.createdAt - b.createdAt;
    });
}

export function listAllItems(harnessDir: string): BacklogItem[] {
  const backlog = readBacklog(harnessDir);
  return backlog.items.sort((a, b) => {
    const priDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priDiff !== 0) return priDiff;
    return a.createdAt - b.createdAt;
  });
}

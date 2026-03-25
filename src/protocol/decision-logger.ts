import type { PendingDecision } from '../types/state';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const DECISIONS_FILE = 'decisions.log';

export function getDecisionsPath(harnessDir: string): string {
  return join(harnessDir, DECISIONS_FILE);
}

export function appendDecision(harnessDir: string, decision: PendingDecision): void {
  const path = getDecisionsPath(harnessDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry = JSON.stringify({
    ...decision,
    loggedAt: Date.now(),
  });
  appendFileSync(path, entry + '\n', 'utf-8');
}

export function readDecisions(harnessDir: string): PendingDecision[] {
  const path = getDecisionsPath(harnessDir);
  try {
    const raw = readFileSync(path, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as PendingDecision);
  } catch {
    return [];
  }
}

export function readPendingDecisions(harnessDir: string): PendingDecision[] {
  return readDecisions(harnessDir).filter((d) => !d.resolved);
}

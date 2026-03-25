import type { OrchestratorState } from '../types/state';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const STATE_FILE = 'state.json';

export function getStatePath(harnessDir: string): string {
  return join(harnessDir, STATE_FILE);
}

export function loadState(harnessDir: string): OrchestratorState | null {
  const path = getStatePath(harnessDir);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as OrchestratorState;
  } catch {
    return null;
  }
}

export function saveState(harnessDir: string, state: OrchestratorState): void {
  const path = getStatePath(harnessDir);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
}

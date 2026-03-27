import type { CheckpointReport, CheckpointType, Issue, Artifact, CriticalPath } from '../types/protocol';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ─── Directory Management ─────────────────────────────────────────

export function ensureCheckpointDir(harnessDir: string): string {
  const cpDir = join(harnessDir, 'checkpoints');
  const artifactsDir = join(cpDir, 'artifacts');
  if (!existsSync(cpDir)) mkdirSync(cpDir, { recursive: true });
  if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });
  return cpDir;
}

// ─── Write / Read Checkpoint ──────────────────────────────────────

export function writeCheckpoint(harnessDir: string, report: CheckpointReport): string {
  const cpDir = ensureCheckpointDir(harnessDir);
  const filename = `checkpoint-${report.type}-${report.featureId ?? 'goal'}-${Date.now()}.json`;
  const path = join(cpDir, filename);
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8');
  return path;
}

export function readCheckpoints(harnessDir: string): CheckpointReport[] {
  const cpDir = join(harnessDir, 'checkpoints');
  if (!existsSync(cpDir)) return [];

  return readdirSync(cpDir)
    .filter((f) => f.startsWith('checkpoint-') && f.endsWith('.json'))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(cpDir, f), 'utf-8')) as CheckpointReport;
      } catch {
        return null;
      }
    })
    .filter((r): r is CheckpointReport => r !== null);
}

// ─── Critical Path ────────────────────────────────────────────────

export function getCriticalPathPath(harnessDir: string, sprintId: string): string {
  return join(harnessDir, 'critical-path', `${sprintId}.json`);
}

export function ensureCriticalPathDir(harnessDir: string): void {
  const dir = join(harnessDir, 'critical-path');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readCriticalPath(harnessDir: string, sprintId: string): CriticalPath | null {
  try {
    const raw = readFileSync(getCriticalPathPath(harnessDir, sprintId), 'utf-8');
    return JSON.parse(raw) as CriticalPath;
  } catch {
    return null;
  }
}

export function writeCriticalPath(harnessDir: string, sprintId: string, cp: CriticalPath): void {
  ensureCriticalPathDir(harnessDir);
  writeFileSync(getCriticalPathPath(harnessDir, sprintId), JSON.stringify(cp, null, 2), 'utf-8');
}

// ─── Build Checkpoint Report ──────────────────────────────────────

export function buildCheckpointReport(params: {
  type: CheckpointType;
  sprintId: string;
  featureId?: string;
  completedFeatures: string[];
  remainingFeatures: string[];
  criticalPathStatus: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_RUN';
  criticalPathResults?: { stepId: string; status: 'PASS' | 'FAIL' | 'SKIP'; actualOutput?: string }[];
  testSummary: { total: number; passed: number; failed: number; skipped: number };
  artifacts: Artifact[];
  issues: Issue[];
  narrative: string;
}): CheckpointReport {
  return {
    ...params,
    timestamp: Date.now(),
  };
}

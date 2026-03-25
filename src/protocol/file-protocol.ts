import type { EvalReport, EvalVerdict, FeatureSpec, SprintContract } from '../types/protocol';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

// ─── Harness Directory Structure ───────────────────────────────────

export function ensureHarnessDir(rootDir: string): string {
  const harnessDir = join(rootDir, '.harness');
  const dirs = ['specs', 'contracts', 'reports'];
  for (const d of dirs) {
    const p = join(harnessDir, d);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  return harnessDir;
}

// ─── Spec ──────────────────────────────────────────────────────────

export function getSpecPath(harnessDir: string, sprintId: string): string {
  return join(harnessDir, 'specs', `${sprintId}.md`);
}

export function readSpec(harnessDir: string, sprintId: string): string | null {
  try {
    return readFileSync(getSpecPath(harnessDir, sprintId), 'utf-8');
  } catch {
    return null;
  }
}

// ─── Contract ──────────────────────────────────────────────────────

export function getContractPath(harnessDir: string, sprintId: string): string {
  return join(harnessDir, 'contracts', `${sprintId}.md`);
}

export function readContract(harnessDir: string, sprintId: string): string | null {
  try {
    return readFileSync(getContractPath(harnessDir, sprintId), 'utf-8');
  } catch {
    return null;
  }
}

// ─── Report ────────────────────────────────────────────────────────

export function getReportPath(
  harnessDir: string,
  sprintId: string,
  round: number
): string {
  return join(harnessDir, 'reports', `${sprintId}-round-${round}.json`);
}

export function readReport(
  harnessDir: string,
  sprintId: string,
  round: number
): EvalReport | null {
  try {
    const raw = readFileSync(getReportPath(harnessDir, sprintId, round), 'utf-8');
    return JSON.parse(raw) as EvalReport;
  } catch {
    return null;
  }
}

export function getLatestReport(
  harnessDir: string,
  sprintId: string
): EvalReport | null {
  const reportsDir = join(harnessDir, 'reports');
  if (!existsSync(reportsDir)) return null;

  const files = readdirSync(reportsDir)
    .filter((f) => f.startsWith(sprintId) && f.endsWith('.json'))
    .sort();

  if (files.length === 0) return null;

  try {
    const raw = readFileSync(join(reportsDir, files[files.length - 1]), 'utf-8');
    return JSON.parse(raw) as EvalReport;
  } catch {
    return null;
  }
}

// ─── Parse Eval Verdict ────────────────────────────────────────────

/**
 * Parse the evaluator's output (which might be in the report file
 * or in the agent's raw output) to extract the verdict.
 */
export function parseEvalVerdict(
  harnessDir: string,
  sprintId: string,
  round: number,
  agentOutput?: string
): { verdict: EvalVerdict; report: EvalReport } | null {
  // First try reading the report file (evaluator writes it directly)
  const report = readReport(harnessDir, sprintId, round);
  if (report) {
    return { verdict: report.verdict, report };
  }

  // Fallback: try to parse from agent output
  if (agentOutput) {
    try {
      const jsonMatch = agentOutput.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const evalReport: EvalReport = {
          sprintId,
          round,
          verdict: parsed.verdict ?? 'FAIL',
          timestamp: Date.now(),
          summary: parsed.summary ?? '',
          passedAcs: parsed.passedAcs ?? [],
          failedAcs: parsed.failedAcs ?? [],
          suggestions: parsed.suggestions ?? [],
          score: parsed.score,
        };

        // Write the report file for persistence
        const reportPath = getReportPath(harnessDir, sprintId, round);
        const dir = dirname(reportPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(reportPath, JSON.stringify(evalReport, null, 2), 'utf-8');

        return { verdict: evalReport.verdict, report: evalReport };
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

// ─── Stuck Detection ───────────────────────────────────────────────

/**
 * Check if the same AC IDs have failed for consecutive rounds.
 */
export function isStuck(failedAcIds: string[], previousFailedAcIds: string[]): boolean {
  if (failedAcIds.length === 0 || previousFailedAcIds.length === 0) return false;

  const currentSet = new Set(failedAcIds);
  const prevSet = new Set(previousFailedAcIds);

  if (currentSet.size !== prevSet.size) return false;

  for (const id of currentSet) {
    if (!prevSet.has(id)) return false;
  }
  return true;
}

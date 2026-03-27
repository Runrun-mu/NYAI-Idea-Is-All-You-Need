import type { SprintRetrospective, ChallengeRecord } from '../types/memory';
import type { OrchestratorState } from '../types/state';
import type { EvalReport } from '../types/protocol';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { addBacklogItem } from './backlog-store';

// ─── Build Retrospective (Zero LLM Cost) ────────────────────────────

export function buildRetrospective(
  harnessDir: string,
  state: OrchestratorState,
  finalCostUsd: number,
  finalDurationMs: number
): SprintRetrospective {
  const { sprintId, prompt, round, previouslyPassedAcs } = state;

  // Read all reports for this sprint
  const reports = readAllReports(harnessDir, sprintId);

  // Determine final verdict from last report
  const lastReport = reports.length > 0 ? reports[reports.length - 1] : null;
  const verdict = lastReport?.verdict ?? null;

  // Read spec to extract patterns and built items
  const spec = readSpecSafe(harnessDir, sprintId);

  // Extract data from artifacts
  const built = extractBuiltItems(spec, previouslyPassedAcs);
  const challenges = extractChallenges(reports);
  const patterns = extractPatterns(spec);
  const decisions = readDecisionsSafe(harnessDir);

  // Collect all failed ACs from the final report
  const failedAcs = lastReport
    ? lastReport.failedAcs.map((f) => f.id)
    : [];

  // Deferred items: ACs that failed in the last round
  const deferred = lastReport
    ? lastReport.failedAcs.map((f) => `${f.id}: ${f.description || f.reason}`)
    : [];

  const retro: SprintRetrospective = {
    sprintId,
    timestamp: Date.now(),
    prompt,
    verdict,
    rounds: round,
    costUsd: finalCostUsd,
    durationMs: finalDurationMs,
    built,
    decisions,
    challenges,
    patterns,
    deferred,
    passedAcs: previouslyPassedAcs,
    failedAcs,
  };

  // Auto-submit deferred items to backlog
  for (const deferredItem of deferred) {
    try {
      addBacklogItem(harnessDir, {
        type: 'improvement',
        title: deferredItem,
        priority: 'medium',
        submittedBy: 'evaluator',
        source: `Deferred from ${sprintId}`,
      });
    } catch {
      // Non-fatal
    }
  }

  return retro;
}

// ─── Helpers ──────────────────────────────────────────────────────────

export function extractBuiltItems(
  spec: string | null,
  passedAcs: string[]
): string[] {
  if (!spec || passedAcs.length === 0) return [];

  const built: string[] = [];
  for (const acId of passedAcs) {
    // Try to find the AC description from the spec
    // Pattern: AC-N: description or AC-N — description
    const pattern = new RegExp(
      `${acId.replace('-', '\\-')}[:\\s—–-]+(.+?)(?:\\n|$)`,
      'i'
    );
    const match = spec.match(pattern);
    if (match) {
      built.push(`${acId}: ${match[1].trim()}`);
    } else {
      built.push(acId);
    }
  }
  return built;
}

export function extractChallenges(reports: EvalReport[]): ChallengeRecord[] {
  const challenges: ChallengeRecord[] = [];

  // Track ACs that went from FAIL → PASS across rounds
  const failedInRound = new Map<string, number>(); // acId → first fail round

  for (const report of reports) {
    // Record failures
    for (const f of report.failedAcs) {
      if (!failedInRound.has(f.id)) {
        failedInRound.set(f.id, report.round);
      }
    }

    // Check for recoveries (was failing, now passing)
    for (const passedAc of report.passedAcs) {
      const failRound = failedInRound.get(passedAc);
      if (failRound !== undefined) {
        // Find the failure reason from earlier reports
        let failReason = '';
        for (const r of reports) {
          const failedAc = r.failedAcs.find((f) => f.id === passedAc);
          if (failedAc) {
            failReason = failedAc.reason;
            break;
          }
        }

        challenges.push({
          description: `${passedAc} failed in round ${failRound}: ${failReason}`,
          resolution: `Fixed by round ${report.round}`,
          resolvedInRound: report.round,
        });

        failedInRound.delete(passedAc);
      }
    }
  }

  return challenges;
}

export function extractPatterns(spec: string | null): string[] {
  if (!spec) return [];

  const patterns: string[] = [];

  // Extract tech/framework mentions from spec
  const techPatterns = [
    /(?:using|with|via)\s+([\w.]+(?:\s+[\w.]+)?)/gi,
    /(?:framework|library|tool|stack):\s*(.+?)(?:\n|$)/gi,
  ];

  for (const pattern of techPatterns) {
    const matches = spec.matchAll(pattern);
    for (const match of matches) {
      const tech = match[1].trim();
      if (tech.length > 2 && tech.length < 50) {
        patterns.push(tech);
      }
    }
  }

  // Deduplicate
  return [...new Set(patterns)].slice(0, 10);
}

// ─── File Reading Helpers ─────────────────────────────────────────────

function readAllReports(harnessDir: string, sprintId: string): EvalReport[] {
  const reportsDir = join(harnessDir, 'reports');
  if (!existsSync(reportsDir)) return [];

  const files = readdirSync(reportsDir)
    .filter((f) => f.startsWith(sprintId) && f.endsWith('.json'))
    .sort();

  const reports: EvalReport[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(reportsDir, file), 'utf-8');
      reports.push(JSON.parse(raw) as EvalReport);
    } catch {
      // Skip unparseable reports
    }
  }
  return reports;
}

function readSpecSafe(harnessDir: string, sprintId: string): string | null {
  try {
    return readFileSync(join(harnessDir, 'specs', `${sprintId}.md`), 'utf-8');
  } catch {
    return null;
  }
}

function readDecisionsSafe(harnessDir: string): string[] {
  try {
    const raw = readFileSync(join(harnessDir, 'decisions.log'), 'utf-8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const d = JSON.parse(line);
          return d.summary || d.resolution || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

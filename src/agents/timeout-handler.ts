import type { AgentResult } from '../types/agent';
import type { TimeoutContext } from '../types/protocol';
import { execSync } from 'child_process';

/**
 * Check if an agent result indicates a timeout.
 * Either the timedOut flag is set, or exit code 143 (SIGTERM).
 */
export function isTimeoutResult(result: AgentResult): boolean {
  return result.timedOut === true;
}

/**
 * Snapshot the current git HEAD ref before a generator run.
 * Returns the commit hash, or null if not a git repo.
 */
export function snapshotGitHead(workingDir: string): string | null {
  try {
    const ref = execSync('git rev-parse HEAD', {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return ref || null;
  } catch {
    return null;
  }
}

/**
 * Get list of files modified since a given git ref.
 * Returns file paths relative to workingDir.
 */
export function getModifiedFiles(workingDir: string, beforeRef: string | null): string[] {
  if (!beforeRef) return [];

  try {
    const output = execSync(`git diff --name-only ${beforeRef} HEAD`, {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();

    if (!output) return [];
    return output.split('\n').filter(Boolean);
  } catch {
    // Fallback: check for any uncommitted changes
    try {
      const output = execSync('git diff --name-only', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
      if (!output) return [];
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

/**
 * Build a TimeoutContext from agent result and runtime info.
 */
export function buildTimeoutContext(
  result: AgentResult,
  round: number,
  workingDir: string,
  beforeRef: string | null,
  retryCount: number,
  totalTimeSpentMs: number
): TimeoutContext {
  const filesModified = getModifiedFiles(workingDir, beforeRef);

  return {
    round,
    durationMs: result.durationMs,
    partialOutput: result.partialOutput ?? result.output ?? '',
    filesModified,
    retryCount,
    totalTimeSpentMs,
  };
}

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const PROGRESS_FILE = 'progress.log';

export interface ProgressEntry {
  timestamp: number;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Append a progress entry to the progress log.
 */
export function appendProgress(
  harnessDir: string,
  type: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const path = join(harnessDir, PROGRESS_FILE);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: ProgressEntry = {
    timestamp: Date.now(),
    type,
    message,
    data,
  };
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Read all progress entries from the log.
 */
export function readProgress(harnessDir: string): ProgressEntry[] {
  const path = join(harnessDir, PROGRESS_FILE);
  try {
    const raw = readFileSync(path, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ProgressEntry);
  } catch {
    return [];
  }
}

/**
 * Get the progress log file path.
 */
export function getProgressPath(harnessDir: string): string {
  return join(harnessDir, PROGRESS_FILE);
}

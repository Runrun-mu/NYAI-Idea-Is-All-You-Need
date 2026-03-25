import type { ArchitectureRecord } from '../types/protocol';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ARCHITECTURE_FILE = 'architecture.json';

/**
 * Check if an architecture record already exists.
 */
export function hasArchitectureRecord(harnessDir: string): boolean {
  return existsSync(join(harnessDir, ARCHITECTURE_FILE));
}

/**
 * Read the architecture record from disk.
 */
export function readArchitectureRecord(harnessDir: string): ArchitectureRecord | null {
  const path = join(harnessDir, ARCHITECTURE_FILE);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as ArchitectureRecord;
  } catch {
    return null;
  }
}

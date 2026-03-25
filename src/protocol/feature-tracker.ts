import type { FeatureList, FeatureItem, FeatureStatus } from '../types/protocol';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const FEATURES_FILE = 'features.json';

/**
 * Get the features.json file path.
 */
export function getFeaturesPath(harnessDir: string): string {
  return join(harnessDir, FEATURES_FILE);
}

/**
 * Check if a features list exists.
 */
export function hasFeatureList(harnessDir: string): boolean {
  return existsSync(getFeaturesPath(harnessDir));
}

/**
 * Read the feature list from disk.
 */
export function readFeatureList(harnessDir: string): FeatureList | null {
  const path = getFeaturesPath(harnessDir);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as FeatureList;
  } catch {
    return null;
  }
}

/**
 * Write the feature list to disk.
 */
export function writeFeatureList(harnessDir: string, featureList: FeatureList): void {
  const path = getFeaturesPath(harnessDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  featureList.updatedAt = Date.now();
  writeFileSync(path, JSON.stringify(featureList, null, 2), 'utf-8');
}

/**
 * Update the status of a specific feature.
 */
export function updateFeatureStatus(
  harnessDir: string,
  featureId: string,
  status: FeatureStatus,
  sprintId?: string
): FeatureList | null {
  const list = readFeatureList(harnessDir);
  if (!list) return null;

  const feature = list.features.find((f) => f.id === featureId);
  if (!feature) return null;

  feature.status = status;
  if (sprintId) feature.sprintId = sprintId;
  if (status === 'done') feature.completedAt = Date.now();

  writeFeatureList(harnessDir, list);
  return list;
}

/**
 * Get the next pending feature from the list.
 */
export function getNextPendingFeature(harnessDir: string): FeatureItem | null {
  const list = readFeatureList(harnessDir);
  if (!list) return null;
  return list.features.find((f) => f.status === 'pending') ?? null;
}

/**
 * Create a feature list from planner output.
 */
export function createFeatureList(
  harnessDir: string,
  parentPrompt: string,
  features: Omit<FeatureItem, 'status' | 'sprintId' | 'completedAt'>[]
): FeatureList {
  const featureList: FeatureList = {
    parentPrompt,
    features: features.map((f) => ({
      ...f,
      status: 'pending' as FeatureStatus,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  writeFeatureList(harnessDir, featureList);
  return featureList;
}

/**
 * Deployment record store for the NYAI orchestrator.
 *
 * Manages deployment records as a JSON file, tracking
 * deployment history for the Deployer agent.
 *
 * @module protocol/deployment-store
 */

import { join } from 'path';
import { readJsonFile, writeJsonFile } from '../utils/fs';

const DEPLOYMENTS_FILE = 'deployments.json';

// ─── Types ────────────────────────────────────────────────────────

export interface DeploymentRecord {
  sprintId: string;
  timestamp: number;
  target: string;
  url?: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  durationMs?: number;
}

export interface DeploymentStore {
  deployments: DeploymentRecord[];
  updatedAt: number;
}

// ─── Paths ────────────────────────────────────────────────────────

/**
 * Get the deployments.json file path.
 *
 * @param harnessDir - The harness directory path
 * @returns The full path to deployments.json
 */
export function getDeploymentsPath(harnessDir: string): string {
  return join(harnessDir, DEPLOYMENTS_FILE);
}

// ─── CRUD ─────────────────────────────────────────────────────────

/**
 * Read all deployment records from disk.
 *
 * @param harnessDir - The harness directory path
 * @returns Array of deployment records (empty if file doesn't exist)
 */
export function listDeployments(harnessDir: string): DeploymentRecord[] {
  const store = readJsonFile<DeploymentStore>(getDeploymentsPath(harnessDir));
  return store?.deployments ?? [];
}

/**
 * Read the latest deployment record.
 *
 * @param harnessDir - The harness directory path
 * @returns The latest deployment record, or null if none
 */
export function readDeployment(harnessDir: string): DeploymentRecord | null {
  const deployments = listDeployments(harnessDir);
  return deployments.length > 0 ? deployments[deployments.length - 1] : null;
}

/**
 * Write (append) a deployment record to disk.
 *
 * @param harnessDir - The harness directory path
 * @param record - The deployment record to write
 */
export function writeDeployment(harnessDir: string, record: DeploymentRecord): void {
  const path = getDeploymentsPath(harnessDir);
  const store = readJsonFile<DeploymentStore>(path) ?? {
    deployments: [],
    updatedAt: Date.now(),
  };

  store.deployments.push(record);
  store.updatedAt = Date.now();

  writeJsonFile(path, store);
}

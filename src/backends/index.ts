import type { BackendType } from '../types/agent';
import type { BackendAdapter } from './backend';
import { ClaudeBackend } from './claude-backend';
import { CodexBackend } from './codex-backend';
import { OpencodeBackend } from './opencode-backend';

const backends: Record<BackendType, () => BackendAdapter> = {
  claude: () => new ClaudeBackend(),
  codex: () => new CodexBackend(),
  opencode: () => new OpencodeBackend(),
};

/**
 * Factory function: get a BackendAdapter by type.
 * Defaults to 'claude' if type is undefined.
 */
export function getBackend(type?: BackendType): BackendAdapter {
  const factory = backends[type ?? 'claude'];
  if (!factory) {
    throw new Error(`Unknown backend type: ${type}`);
  }
  return factory();
}

export type { BackendAdapter } from './backend';

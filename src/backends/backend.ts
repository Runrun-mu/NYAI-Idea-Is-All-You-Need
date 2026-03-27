import type { AgentInvocation } from '../types/agent';

/**
 * BackendAdapter — strategy pattern for different AI CLI backends.
 * Each backend knows how to:
 * 1. Determine the CLI command to invoke
 * 2. Build the argument list from an AgentInvocation
 * 3. Parse the stdout output into a structured result
 */
export interface BackendAdapter {
  /** The CLI command name (e.g., 'claude', 'codex', 'opencode') */
  command: string;

  /** Build CLI arguments from an invocation */
  buildArgs(invocation: AgentInvocation): string[];

  /** Parse agent stdout output into a structured result */
  parseOutput(
    role: AgentInvocation['role'],
    stdout: string,
    exitCode: number,
    stderr?: string
  ): {
    success: boolean;
    output: string;
    costUsd: number;
    durationMs: number;
    numTurns: number;
    sessionId: string;
    error?: string;
  };
}

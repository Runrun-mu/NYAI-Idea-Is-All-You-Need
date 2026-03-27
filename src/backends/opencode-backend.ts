import type { BackendAdapter } from './backend';
import type { AgentInvocation } from '../types/agent';

export class OpencodeBackend implements BackendAdapter {
  command = 'opencode';

  buildArgs(inv: AgentInvocation): string[] {
    const args: string[] = [];

    if (inv.model) {
      args.push('--model', inv.model);
    }

    // OpenCode uses --prompt for non-interactive mode
    const fullPrompt = inv.systemPrompt
      ? `${inv.systemPrompt}\n\n---\n\n${inv.userPrompt}`
      : inv.userPrompt;

    args.push('--prompt', fullPrompt);

    return args;
  }

  parseOutput(
    role: AgentInvocation['role'],
    stdout: string,
    exitCode: number,
    _stderr?: string
  ) {
    // OpenCode outputs plain text
    return {
      success: exitCode === 0,
      output: stdout.trim(),
      costUsd: 0,
      durationMs: 0,
      numTurns: 0,
      sessionId: '',
      error: exitCode !== 0 ? `OpenCode exit code: ${exitCode}` : undefined,
    };
  }
}

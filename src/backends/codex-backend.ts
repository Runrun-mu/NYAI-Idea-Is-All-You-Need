import type { BackendAdapter } from './backend';
import type { AgentInvocation } from '../types/agent';

export class CodexBackend implements BackendAdapter {
  command = 'codex';

  buildArgs(inv: AgentInvocation): string[] {
    const args: string[] = [
      '--quiet',
      '--full-auto',
    ];

    if (inv.model) {
      args.push('--model', inv.model);
    }

    // Codex takes the prompt as the last positional argument
    // We'll combine system prompt and user prompt
    const fullPrompt = inv.systemPrompt
      ? `${inv.systemPrompt}\n\n---\n\n${inv.userPrompt}`
      : inv.userPrompt;

    args.push(fullPrompt);

    return args;
  }

  parseOutput(
    role: AgentInvocation['role'],
    stdout: string,
    exitCode: number,
    _stderr?: string
  ) {
    // Codex outputs plain text, no structured JSON
    return {
      success: exitCode === 0,
      output: stdout.trim(),
      costUsd: 0, // Codex doesn't report cost in CLI output
      durationMs: 0,
      numTurns: 0,
      sessionId: '',
      error: exitCode !== 0 ? `Codex exit code: ${exitCode}` : undefined,
    };
  }
}

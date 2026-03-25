import type { BackendAdapter } from './backend';
import type { AgentInvocation, ClaudeJsonOutput } from '../types/agent';

export class ClaudeBackend implements BackendAdapter {
  command = 'claude';

  buildArgs(inv: AgentInvocation): string[] {
    const args: string[] = [
      '-p',
      '--output-format', 'json',
      '--verbose',
      '--max-turns', String(inv.maxTurns ?? 50),
      '--permission-mode', 'bypassPermissions',
    ];

    if (inv.model) {
      args.push('--model', inv.model);
    }

    if (inv.systemPrompt) {
      args.push('--system-prompt', inv.systemPrompt);
    }

    if (inv.allowedTools?.length) {
      for (const tool of inv.allowedTools) {
        args.push('--allowedTools', tool);
      }
    }

    if (inv.disallowedTools?.length) {
      for (const tool of inv.disallowedTools) {
        args.push('--disallowedTools', tool);
      }
    }

    return args;
  }

  parseOutput(
    role: AgentInvocation['role'],
    stdout: string,
    exitCode: number
  ) {
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*"type"\s*:\s*"result"[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: exitCode === 0,
          output: stdout.trim(),
          costUsd: 0,
          durationMs: 0,
          numTurns: 0,
          sessionId: '',
          error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
        };
      }

      const json: ClaudeJsonOutput = JSON.parse(jsonMatch[0]);
      return {
        success: !json.is_error && json.subtype === 'success',
        output: json.result,
        costUsd: json.cost_usd ?? 0,
        durationMs: json.duration_ms ?? 0,
        numTurns: json.num_turns ?? 0,
        sessionId: json.session_id ?? '',
        error: json.is_error ? json.result : undefined,
      };
    } catch {
      return {
        success: exitCode === 0,
        output: stdout.trim(),
        costUsd: 0,
        durationMs: 0,
        numTurns: 0,
        sessionId: '',
        error: `Failed to parse JSON output. Exit code: ${exitCode}`,
      };
    }
  }
}

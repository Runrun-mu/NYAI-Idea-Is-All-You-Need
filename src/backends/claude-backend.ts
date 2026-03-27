import type { BackendAdapter } from './backend';
import type { AgentInvocation } from '../types/agent';
import { parseClaudeJson } from './json-parser';

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
    exitCode: number,
    stderr?: string
  ) {
    const { json, costUsd, source } = parseClaudeJson(stdout, stderr);

    if (json) {
      return {
        success: !json.is_error && json.subtype === 'success',
        output: json.result,
        costUsd: json.cost_usd ?? 0,
        durationMs: json.duration_ms ?? 0,
        numTurns: json.num_turns ?? 0,
        sessionId: json.session_id ?? '',
        error: json.is_error ? json.result : undefined,
      };
    }

    // No JSON parsed — use fallback cost from stderr if available
    return {
      success: exitCode === 0,
      output: stdout.trim(),
      costUsd,
      durationMs: 0,
      numTurns: 0,
      sessionId: '',
      error: exitCode !== 0
        ? `Exit code: ${exitCode}${source !== 'none' ? ` (cost recovered from ${source})` : ''}`
        : undefined,
    };
  }
}

import type { AgentInvocation, AgentResult, ClaudeJsonOutput } from '../types/agent';

const MOCK_DELAY_MS = 2000;

interface RunAgentOptions {
  invocation: AgentInvocation;
  onStderrLine?: (line: string) => void;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Spawns `claude -p` as a child process.
 * - stderr is streamed line-by-line via onStderrLine callback (real-time logs)
 * - stdout is collected and JSON-parsed for the structured result
 * - Supports mock mode via NYAI_MOCK_AGENTS=1
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  if (process.env.NYAI_MOCK_AGENTS === '1') {
    return runMockAgent(opts);
  }

  const { invocation, onStderrLine, abortSignal, timeoutMs = 600_000 } = opts;

  const args = buildClaudeArgs(invocation);

  const proc = Bun.spawn(['claude', ...args], {
    cwd: invocation.workingDir,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });

  // Send the user prompt via stdin
  proc.stdin.write(invocation.userPrompt);
  proc.stdin.end();

  // Stream stderr line-by-line
  const stderrPromise = streamLines(proc.stderr, (line) => {
    onStderrLine?.(line);
  });

  // Collect stdout
  const stdoutPromise = collectStream(proc.stdout);

  // Timeout handling
  const timeoutId = setTimeout(() => {
    proc.kill('SIGTERM');
  }, timeoutMs);

  // Handle abort signal
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      proc.kill('SIGTERM');
    });
  }

  try {
    const [stdout] = await Promise.all([stdoutPromise, stderrPromise]);
    clearTimeout(timeoutId);

    const exitCode = await proc.exited;

    return parseAgentOutput(invocation.role, stdout, exitCode);
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      role: invocation.role,
      success: false,
      output: '',
      costUsd: 0,
      durationMs: 0,
      numTurns: 0,
      sessionId: '',
      error: `Agent process error: ${err}`,
    };
  }
}

function buildClaudeArgs(inv: AgentInvocation): string[] {
  const args: string[] = [
    '-p',
    '--output-format', 'json',
    '--verbose',
    '--max-turns', String(inv.maxTurns ?? 50),
    '--permission-mode', 'bypassPermissions',
  ];

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

function parseAgentOutput(
  role: AgentInvocation['role'],
  stdout: string,
  exitCode: number
): AgentResult {
  try {
    // Try to find valid JSON in the output (might have extra text around it)
    const jsonMatch = stdout.match(/\{[\s\S]*"type"\s*:\s*"result"[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: treat entire stdout as plain text result
      return {
        role,
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
      role,
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
      role,
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

async function streamLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
    }
    // Flush remaining buffer
    if (buffer.trim()) onLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}

// ─── Mock Agent ────────────────────────────────────────────────────

async function runMockAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const { invocation, onStderrLine } = opts;
  const { role } = invocation;

  const mockLogs = getMockLogs(role);
  for (const log of mockLogs) {
    onStderrLine?.(log);
    await Bun.sleep(MOCK_DELAY_MS / mockLogs.length);
  }

  const mockOutputs: Record<string, string> = {
    planner: 'Feature spec and sprint contract created successfully.',
    generator: 'Implementation completed. All files written.',
    evaluator: JSON.stringify({
      verdict: 'PASS',
      summary: 'All acceptance criteria met.',
      passedAcs: ['AC-1', 'AC-2'],
      failedAcs: [],
      suggestions: [],
    }),
  };

  return {
    role,
    success: true,
    output: mockOutputs[role] ?? 'Mock output',
    costUsd: 0.01,
    durationMs: MOCK_DELAY_MS,
    numTurns: 3,
    sessionId: `mock-${role}-${Date.now()}`,
  };
}

function getMockLogs(role: string): string[] {
  const base = [
    `[${role}] Starting agent...`,
    `[${role}] Reading project context...`,
    `[${role}] Analyzing requirements...`,
  ];
  const specific: Record<string, string[]> = {
    planner: [
      '[planner] Drafting feature spec...',
      '[planner] Defining acceptance criteria...',
      '[planner] Writing sprint contract...',
      '[planner] ✅ Spec and contract ready.',
    ],
    generator: [
      '[generator] Reading spec and contract...',
      '[generator] Scaffolding project structure...',
      '[generator] Implementing core logic...',
      '[generator] Writing tests...',
      '[generator] ✅ Implementation complete.',
    ],
    evaluator: [
      '[evaluator] Reading spec and implementation...',
      '[evaluator] Running tests...',
      '[evaluator] Checking acceptance criteria...',
      '[evaluator] ✅ Evaluation complete.',
    ],
  };
  return [...base, ...(specific[role] ?? ['[mock] Done.'])];
}

import type { AgentInvocation, AgentResult, ClaudeJsonOutput } from '../types/agent';
import { getBackend } from '../backends/index';

const MOCK_DELAY_MS = 2000;

interface RunAgentOptions {
  invocation: AgentInvocation;
  onStderrLine?: (line: string) => void;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Spawns the appropriate backend CLI as a child process.
 * - Uses the BackendAdapter strategy pattern to build args and parse output
 * - stderr is streamed line-by-line via onStderrLine callback (real-time logs)
 * - stderr is also accumulated and passed to backend.parseOutput for fallback parsing
 * - stdout is collected and parsed for the structured result
 * - Supports mock mode via NYAI_MOCK_AGENTS=1
 * - Tracks timeout vs other exit codes via didTimeout flag
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  if (process.env.NYAI_MOCK_AGENTS === '1') {
    return runMockAgent(opts);
  }

  const { invocation, onStderrLine, abortSignal, timeoutMs = 1_200_000 } = opts;

  const backend = getBackend(invocation.backend);
  const args = backend.buildArgs(invocation);
  const startTime = Date.now();

  const proc = Bun.spawn([backend.command, ...args], {
    cwd: invocation.workingDir,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });

  // For Claude backend, send the user prompt via stdin
  if (!invocation.backend || invocation.backend === 'claude') {
    proc.stdin.write(invocation.userPrompt);
    proc.stdin.end();
  } else {
    proc.stdin.end();
  }

  // Track whether we killed due to timeout
  let didTimeout = false;

  // Stream stderr line-by-line and accumulate
  let stderrText = '';
  const stderrPromise = streamLines(proc.stderr, (line) => {
    stderrText += line + '\n';
    onStderrLine?.(line);
  });

  // Collect stdout
  const stdoutPromise = collectStream(proc.stdout);

  // Timeout handling
  const timeoutId = setTimeout(() => {
    didTimeout = true;
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
    const durationMs = Date.now() - startTime;

    // Detect timeout: either our flag or exit code 143 (SIGTERM)
    const timedOut = didTimeout || exitCode === 143;

    const parsed = backend.parseOutput(invocation.role, stdout, exitCode, stderrText);

    return {
      role: invocation.role,
      ...parsed,
      durationMs: parsed.durationMs || durationMs,
      timedOut,
      partialOutput: timedOut ? stdout.trim() : undefined,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    return {
      role: invocation.role,
      success: false,
      output: '',
      costUsd: 0,
      durationMs,
      numTurns: 0,
      sessionId: '',
      error: `Agent process error: ${err}`,
      timedOut: didTimeout,
      partialOutput: didTimeout ? '' : undefined,
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
    architect: JSON.stringify({
      techStack: ['TypeScript', 'Bun', 'React'],
      scaffolding: ['src/', 'tests/', 'package.json'],
      decisions: ['Use Bun runtime', 'Use Ink for TUI'],
      notes: 'Architecture analysis complete.',
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
      '[planner] Done.',
    ],
    generator: [
      '[generator] Reading spec and contract...',
      '[generator] Scaffolding project structure...',
      '[generator] Implementing core logic...',
      '[generator] Writing tests...',
      '[generator] Done.',
    ],
    evaluator: [
      '[evaluator] Reading spec and implementation...',
      '[evaluator] Running tests...',
      '[evaluator] Checking acceptance criteria...',
      '[evaluator] Done.',
    ],
    architect: [
      '[architect] Analyzing project requirements...',
      '[architect] Determining tech stack...',
      '[architect] Creating scaffolding plan...',
      '[architect] Writing architecture record...',
      '[architect] Done.',
    ],
  };
  return [...base, ...(specific[role] ?? ['[mock] Done.'])];
}

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
 * - stdout is collected and parsed for the structured result
 * - Supports mock mode via NYAI_MOCK_AGENTS=1
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  if (process.env.NYAI_MOCK_AGENTS === '1') {
    return runMockAgent(opts);
  }

  const { invocation, onStderrLine, abortSignal, timeoutMs = 600_000 } = opts;

  const backend = getBackend(invocation.backend);
  const args = backend.buildArgs(invocation);

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

    const parsed = backend.parseOutput(invocation.role, stdout, exitCode);
    return {
      role: invocation.role,
      ...parsed,
    };
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

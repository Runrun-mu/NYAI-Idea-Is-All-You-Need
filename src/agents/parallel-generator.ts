import type { AgentResult } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import type { RegressionInfo } from '../types/protocol';
import { buildGeneratorInvocation } from './generator';
import { runAgent } from './agent-runner';

/**
 * Split AC IDs into groups via round-robin assignment.
 */
export function splitWork(acIds: string[], parallelCount: number): string[][] {
  const count = Math.min(parallelCount, acIds.length);
  const groups: string[][] = Array.from({ length: count }, () => []);

  for (let i = 0; i < acIds.length; i++) {
    groups[i % count].push(acIds[i]);
  }

  return groups.filter(g => g.length > 0);
}

export interface ParallelGeneratorOptions {
  config: NYAIConfig;
  sprintId: string;
  round: number;
  assignments: string[][];
  allAcIds: string[];
  previousFeedback?: string;
  previouslyPassedAcs?: string[];
  regressions?: RegressionInfo[];
  timeoutMs: number;
  onStderrLine?: (generatorIndex: string, line: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Run multiple generators in parallel, each responsible for a subset of ACs.
 */
export async function runParallelGenerators(
  opts: ParallelGeneratorOptions
): Promise<AgentResult[]> {
  const {
    config,
    sprintId,
    round,
    assignments,
    allAcIds,
    previousFeedback,
    previouslyPassedAcs,
    regressions,
    timeoutMs,
    onStderrLine,
    abortSignal,
  } = opts;

  const promises = assignments.map(async (myAcs, index) => {
    const otherAcs = allAcIds.filter(ac => !myAcs.includes(ac));

    // Build a specialized generator invocation with scope info
    const invocation = buildGeneratorInvocation(
      config,
      sprintId,
      round,
      previousFeedback,
      previouslyPassedAcs,
      regressions
    );

    // Append parallel scope instructions to the user prompt
    invocation.userPrompt += `

## 🔀 PARALLEL GENERATOR ASSIGNMENT
You are Generator #${index + 1} of ${assignments.length} running in parallel.

**YOUR responsibility**: Implement these acceptance criteria:
${myAcs.map(ac => `- ${ac}`).join('\n')}

**OTHER generators** are handling:
${otherAcs.map(ac => `- ${ac}`).join('\n')}

**IMPORTANT**: Focus ONLY on your assigned ACs. Do NOT modify code that other generators are working on.
If you need shared infrastructure (types, utils), create it but be aware others may do the same.`;

    return runAgent({
      invocation,
      onStderrLine: (line) => {
        onStderrLine?.(`gen-${index + 1}`, line);
      },
      abortSignal,
      timeoutMs,
    });
  });

  return Promise.all(promises);
}

/**
 * Merge results from multiple parallel generators.
 */
export function mergeParallelResults(results: AgentResult[]): AgentResult {
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const maxDuration = Math.max(...results.map(r => r.durationMs));
  const totalTurns = results.reduce((sum, r) => sum + r.numTurns, 0);
  const allOutputs = results.map((r, i) => `--- Generator ${i + 1} ---\n${r.output}`).join('\n\n');
  const anyTimedOut = results.some(r => r.timedOut);
  const allSucceeded = results.every(r => r.success);
  const errors = results.filter(r => r.error).map(r => r.error!);

  return {
    role: 'generator',
    success: allSucceeded,
    output: allOutputs,
    costUsd: totalCost,
    durationMs: maxDuration,
    numTurns: totalTurns,
    sessionId: results[0]?.sessionId ?? '',
    error: errors.length > 0 ? errors.join('; ') : undefined,
    timedOut: anyTimedOut,
    partialOutput: anyTimedOut
      ? results.filter(r => r.timedOut).map(r => r.partialOutput ?? '').join('\n')
      : undefined,
  };
}

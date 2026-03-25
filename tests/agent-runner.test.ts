import { describe, test, expect, beforeEach } from 'bun:test';
import { runAgent } from '../src/agents/agent-runner';
import type { AgentInvocation } from '../src/types/agent';

// These tests use GANAI_MOCK_AGENTS=1 mode

describe('agent-runner (mock mode)', () => {
  beforeEach(() => {
    process.env.GANAI_MOCK_AGENTS = '1';
  });

  test('mock planner returns success', async () => {
    const invocation: AgentInvocation = {
      role: 'planner',
      systemPrompt: 'test prompt',
      userPrompt: 'test requirement',
      allowedTools: ['Read', 'Write'],
      workingDir: '/tmp',
    };

    const logs: string[] = [];
    const result = await runAgent({
      invocation,
      onStderrLine: (line) => logs.push(line),
    });

    expect(result.success).toBe(true);
    expect(result.role).toBe('planner');
    expect(result.costUsd).toBe(0.01);
    expect(result.output).toContain('Feature spec');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('[planner]'))).toBe(true);
  });

  test('mock generator returns success', async () => {
    const invocation: AgentInvocation = {
      role: 'generator',
      systemPrompt: 'test',
      userPrompt: 'implement',
      workingDir: '/tmp',
    };

    const result = await runAgent({ invocation });
    expect(result.success).toBe(true);
    expect(result.role).toBe('generator');
  });

  test('mock evaluator returns success', async () => {
    const invocation: AgentInvocation = {
      role: 'evaluator',
      systemPrompt: 'test',
      userPrompt: 'evaluate',
      workingDir: '/tmp',
    };

    const result = await runAgent({ invocation });
    expect(result.success).toBe(true);
    expect(result.role).toBe('evaluator');
    // Evaluator mock output should contain a verdict
    expect(result.output).toContain('PASS');
  });

  test('stderr callback receives log lines', async () => {
    const invocation: AgentInvocation = {
      role: 'planner',
      systemPrompt: 'test',
      userPrompt: 'test',
      workingDir: '/tmp',
    };

    const logs: string[] = [];
    await runAgent({
      invocation,
      onStderrLine: (line) => logs.push(line),
    });

    expect(logs.length).toBeGreaterThan(3);
    expect(logs[0]).toContain('Starting agent');
  });
});

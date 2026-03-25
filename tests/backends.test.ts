import { describe, test, expect } from 'bun:test';
import { getBackend } from '../src/backends/index';
import { ClaudeBackend } from '../src/backends/claude-backend';
import { CodexBackend } from '../src/backends/codex-backend';
import { OpencodeBackend } from '../src/backends/opencode-backend';
import type { AgentInvocation } from '../src/types/agent';

const baseInvocation: AgentInvocation = {
  role: 'generator',
  systemPrompt: 'You are a test agent.',
  userPrompt: 'Do something.',
  allowedTools: ['Read', 'Write'],
  disallowedTools: ['Bash'],
  maxTurns: 20,
  workingDir: '/tmp',
};

describe('getBackend', () => {
  test('returns ClaudeBackend for "claude"', () => {
    const backend = getBackend('claude');
    expect(backend).toBeInstanceOf(ClaudeBackend);
    expect(backend.command).toBe('claude');
  });

  test('returns CodexBackend for "codex"', () => {
    const backend = getBackend('codex');
    expect(backend).toBeInstanceOf(CodexBackend);
    expect(backend.command).toBe('codex');
  });

  test('returns OpencodeBackend for "opencode"', () => {
    const backend = getBackend('opencode');
    expect(backend).toBeInstanceOf(OpencodeBackend);
    expect(backend.command).toBe('opencode');
  });

  test('defaults to ClaudeBackend when undefined', () => {
    const backend = getBackend(undefined);
    expect(backend).toBeInstanceOf(ClaudeBackend);
  });
});

describe('ClaudeBackend', () => {
  const backend = new ClaudeBackend();

  test('builds correct args', () => {
    const args = backend.buildArgs(baseInvocation);
    expect(args).toContain('-p');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('--verbose');
    expect(args).toContain('--max-turns');
    expect(args).toContain('20');
    expect(args).toContain('--system-prompt');
    expect(args).toContain('You are a test agent.');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read');
    expect(args).toContain('--disallowedTools');
    expect(args).toContain('Bash');
  });

  test('includes model when specified', () => {
    const inv = { ...baseInvocation, model: 'claude-sonnet-4-20250514' };
    const args = backend.buildArgs(inv);
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-20250514');
  });

  test('parses Claude JSON output', () => {
    const json = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Done!',
      cost_usd: 0.05,
      duration_ms: 1000,
      duration_api_ms: 800,
      num_turns: 5,
      session_id: 'abc-123',
    });

    const result = backend.parseOutput('generator', json, 0);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Done!');
    expect(result.costUsd).toBe(0.05);
    expect(result.numTurns).toBe(5);
    expect(result.sessionId).toBe('abc-123');
  });

  test('handles plain text output', () => {
    const result = backend.parseOutput('generator', 'Just plain text', 0);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Just plain text');
  });

  test('handles error output', () => {
    const result = backend.parseOutput('generator', '', 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Exit code: 1');
  });
});

describe('CodexBackend', () => {
  const backend = new CodexBackend();

  test('builds correct args', () => {
    const args = backend.buildArgs(baseInvocation);
    expect(args).toContain('--quiet');
    expect(args).toContain('--full-auto');
    // Last arg should be the combined prompt
    const lastArg = args[args.length - 1];
    expect(lastArg).toContain('You are a test agent.');
    expect(lastArg).toContain('Do something.');
  });

  test('includes model when specified', () => {
    const inv = { ...baseInvocation, model: 'o3-mini' };
    const args = backend.buildArgs(inv);
    expect(args).toContain('--model');
    expect(args).toContain('o3-mini');
  });

  test('parses plain text output', () => {
    const result = backend.parseOutput('generator', 'Codex output', 0);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Codex output');
  });
});

describe('OpencodeBackend', () => {
  const backend = new OpencodeBackend();

  test('builds correct args', () => {
    const args = backend.buildArgs(baseInvocation);
    expect(args).toContain('--prompt');
    const promptIdx = args.indexOf('--prompt');
    const promptVal = args[promptIdx + 1];
    expect(promptVal).toContain('You are a test agent.');
    expect(promptVal).toContain('Do something.');
  });

  test('parses plain text output', () => {
    const result = backend.parseOutput('generator', 'OpenCode output', 0);
    expect(result.success).toBe(true);
    expect(result.output).toBe('OpenCode output');
  });
});

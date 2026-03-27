import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildArchitectInvocation } from '../src/agents/architect';
import { hasArchitectureRecord, readArchitectureRecord } from '../src/protocol/architecture';
import type { NYAIConfig } from '../src/types/config';
import { defaultConfig } from '../src/types/config';
import { runAgent } from '../src/agents/agent-runner';

const TEST_DIR = join(import.meta.dir, '.test-architect');
const HARNESS_DIR = join(TEST_DIR, '.harness');

beforeEach(() => {
  process.env.NYAI_MOCK_AGENTS = '1';
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'specs'), { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'contracts'), { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'reports'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('buildArchitectInvocation', () => {
  test('builds invocation with correct role', () => {
    const config: NYAIConfig = {
      ...defaultConfig('test', TEST_DIR),
      agents: {
        ...defaultConfig('test', TEST_DIR).agents,
        architect: { maxTurns: 20 },
      },
    };

    const inv = buildArchitectInvocation(config, 'Build a chat app', 'sprint-1');
    expect(inv.role).toBe('architect');
    expect(inv.userPrompt).toContain('Build a chat app');
    expect(inv.userPrompt).toContain('architecture.json');
    expect(inv.maxTurns).toBe(20);
  });

  test('prompt includes test infrastructure requirements', () => {
    const config: NYAIConfig = {
      ...defaultConfig('test', TEST_DIR),
      agents: {
        ...defaultConfig('test', TEST_DIR).agents,
        architect: {},
      },
    };

    const inv = buildArchitectInvocation(config, 'Build a chat app', 'sprint-1');
    expect(inv.userPrompt).toContain('test infrastructure');
    expect(inv.userPrompt).toContain('testInfra');
    expect(inv.userPrompt).toContain('unitRunner');
    expect(inv.userPrompt).toContain('unitCommand');
    expect(inv.userPrompt).toContain('package.json');
  });

  test('uses default allowed tools', () => {
    const config: NYAIConfig = {
      ...defaultConfig('test', TEST_DIR),
      agents: {
        ...defaultConfig('test', TEST_DIR).agents,
        architect: {},
      },
    };

    const inv = buildArchitectInvocation(config, 'test', 'sprint-1');
    expect(inv.allowedTools).toContain('Read');
    expect(inv.allowedTools).toContain('Bash');
    expect(inv.allowedTools).toContain('Write');
  });

  test('passes backend from config', () => {
    const config: NYAIConfig = {
      ...defaultConfig('test', TEST_DIR),
      backend: 'codex',
      agents: {
        ...defaultConfig('test', TEST_DIR).agents,
        architect: {},
      },
    };

    const inv = buildArchitectInvocation(config, 'test', 'sprint-1');
    expect(inv.backend).toBe('codex');
  });
});

describe('hasArchitectureRecord', () => {
  test('returns false when no record exists', () => {
    expect(hasArchitectureRecord(HARNESS_DIR)).toBe(false);
  });

  test('returns true when record exists', () => {
    writeFileSync(
      join(HARNESS_DIR, 'architecture.json'),
      JSON.stringify({ techStack: ['TS'], scaffolding: [], decisions: [] }),
      'utf-8'
    );
    expect(hasArchitectureRecord(HARNESS_DIR)).toBe(true);
  });
});

describe('readArchitectureRecord', () => {
  test('returns null for non-existent record', () => {
    expect(readArchitectureRecord(HARNESS_DIR)).toBeNull();
  });

  test('reads existing record', () => {
    const record = {
      sprintId: 'sprint-1',
      timestamp: Date.now(),
      techStack: ['TypeScript', 'Bun'],
      scaffolding: ['src/', 'tests/'],
      decisions: ['Use Bun runtime'],
      notes: 'Test',
    };
    writeFileSync(
      join(HARNESS_DIR, 'architecture.json'),
      JSON.stringify(record),
      'utf-8'
    );

    const result = readArchitectureRecord(HARNESS_DIR);
    expect(result).not.toBeNull();
    expect(result!.techStack).toEqual(['TypeScript', 'Bun']);
    expect(result!.decisions).toContain('Use Bun runtime');
  });
});

describe('mock architect agent', () => {
  test('returns architecture output in mock mode', async () => {
    const config: NYAIConfig = {
      ...defaultConfig('test', TEST_DIR),
      agents: {
        ...defaultConfig('test', TEST_DIR).agents,
        architect: {},
      },
    };

    const inv = buildArchitectInvocation(config, 'Build something', 'sprint-1');
    const logs: string[] = [];
    const result = await runAgent({
      invocation: inv,
      onStderrLine: (line) => logs.push(line),
    });

    expect(result.success).toBe(true);
    expect(result.role).toBe('architect');
    expect(result.output).toContain('techStack');
    expect(logs.some((l) => l.includes('[architect]'))).toBe(true);
  });
});

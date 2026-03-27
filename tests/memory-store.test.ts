import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  readMemory,
  writeMemory,
  initMemory,
  appendRetrospective,
  addKnowledge,
  buildMemoryContext,
  formatMemoryForPrompt,
} from '../src/protocol/memory-store';
import type { SprintRetrospective, KnowledgeEntry } from '../src/types/memory';

const TEST_DIR = join(import.meta.dir, '.test-memory');
const HARNESS_DIR = join(TEST_DIR, '.harness');

function makeRetro(overrides: Partial<SprintRetrospective> = {}): SprintRetrospective {
  return {
    sprintId: `sprint-${Date.now()}`,
    timestamp: Date.now(),
    prompt: 'Build a test feature',
    verdict: 'PASS',
    rounds: 2,
    costUsd: 0.05,
    durationMs: 30000,
    built: ['AC-1: Setup tests'],
    decisions: ['Use vitest for testing'],
    challenges: [],
    patterns: ['TypeScript'],
    deferred: [],
    passedAcs: ['AC-1'],
    failedAcs: [],
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(HARNESS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('readMemory / writeMemory', () => {
  test('returns null for non-existent file', () => {
    expect(readMemory(HARNESS_DIR)).toBeNull();
  });

  test('round-trips memory', () => {
    const memory = initMemory('test-project');
    writeMemory(HARNESS_DIR, memory);
    const loaded = readMemory(HARNESS_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.projectName).toBe('test-project');
    expect(loaded!.version).toBe(1);
    expect(loaded!.sprints).toEqual([]);
  });
});

describe('initMemory', () => {
  test('creates empty memory with correct structure', () => {
    const memory = initMemory('my-app');
    expect(memory.version).toBe(1);
    expect(memory.projectName).toBe('my-app');
    expect(memory.sprints).toEqual([]);
    expect(memory.knowledge).toEqual([]);
    expect(memory.stats.totalSprints).toBe(0);
    expect(memory.stats.passRate).toBe(0);
  });
});

describe('appendRetrospective', () => {
  test('creates memory if none exists and appends retro', () => {
    const retro = makeRetro({ sprintId: 'sprint-1' });
    appendRetrospective(HARNESS_DIR, 'test-proj', retro);

    const memory = readMemory(HARNESS_DIR);
    expect(memory).not.toBeNull();
    expect(memory!.sprints).toHaveLength(1);
    expect(memory!.sprints[0].sprintId).toBe('sprint-1');
  });

  test('appends to existing memory', () => {
    appendRetrospective(HARNESS_DIR, 'test-proj', makeRetro({ sprintId: 's1' }));
    appendRetrospective(HARNESS_DIR, 'test-proj', makeRetro({ sprintId: 's2' }));

    const memory = readMemory(HARNESS_DIR);
    expect(memory!.sprints).toHaveLength(2);
  });

  test('updates stats correctly', () => {
    appendRetrospective(HARNESS_DIR, 'proj', makeRetro({ verdict: 'PASS', rounds: 2, costUsd: 0.1 }));
    appendRetrospective(HARNESS_DIR, 'proj', makeRetro({ verdict: 'FAIL', rounds: 4, costUsd: 0.2 }));

    const memory = readMemory(HARNESS_DIR);
    expect(memory!.stats.totalSprints).toBe(2);
    expect(memory!.stats.totalRounds).toBe(6);
    expect(memory!.stats.totalCostUsd).toBeCloseTo(0.3);
    expect(memory!.stats.passRate).toBeCloseTo(0.5);
    expect(memory!.stats.avgRoundsPerSprint).toBeCloseTo(3);
  });

  test('trims to MAX_RETRO_HISTORY (50)', () => {
    for (let i = 0; i < 55; i++) {
      appendRetrospective(HARNESS_DIR, 'proj', makeRetro({ sprintId: `s-${i}` }));
    }

    const memory = readMemory(HARNESS_DIR);
    expect(memory!.sprints.length).toBeLessThanOrEqual(50);
  });
});

describe('addKnowledge', () => {
  test('adds new knowledge entries', () => {
    const entries: KnowledgeEntry[] = [
      {
        id: 'k-1',
        category: 'pattern',
        content: 'Use async/await',
        source: 'sprint-1',
        confidence: 0.5,
        createdAt: Date.now(),
        lastReferencedAt: Date.now(),
      },
    ];

    addKnowledge(HARNESS_DIR, 'proj', entries);

    const memory = readMemory(HARNESS_DIR);
    expect(memory!.knowledge).toHaveLength(1);
    expect(memory!.knowledge[0].content).toBe('Use async/await');
  });

  test('deduplicates and boosts confidence', () => {
    const entry: KnowledgeEntry = {
      id: 'k-1',
      category: 'pattern',
      content: 'Use async/await',
      source: 'sprint-1',
      confidence: 0.5,
      createdAt: Date.now(),
      lastReferencedAt: Date.now(),
    };

    addKnowledge(HARNESS_DIR, 'proj', [entry]);
    addKnowledge(HARNESS_DIR, 'proj', [{ ...entry, id: 'k-2', source: 'sprint-2' }]);

    const memory = readMemory(HARNESS_DIR);
    // Should still be 1 entry, not 2
    expect(memory!.knowledge).toHaveLength(1);
    // Confidence should be boosted
    expect(memory!.knowledge[0].confidence).toBeCloseTo(0.7);
  });

  test('different categories are not deduplicated', () => {
    const entry1: KnowledgeEntry = {
      id: 'k-1',
      category: 'pattern',
      content: 'Use async/await',
      source: 'sprint-1',
      confidence: 0.5,
      createdAt: Date.now(),
      lastReferencedAt: Date.now(),
    };
    const entry2: KnowledgeEntry = {
      ...entry1,
      id: 'k-2',
      category: 'convention',
    };

    addKnowledge(HARNESS_DIR, 'proj', [entry1, entry2]);

    const memory = readMemory(HARNESS_DIR);
    expect(memory!.knowledge).toHaveLength(2);
  });
});

describe('buildMemoryContext', () => {
  test('returns null for empty project', () => {
    expect(buildMemoryContext(HARNESS_DIR)).toBeNull();
  });

  test('returns null for project with no sprints', () => {
    const memory = initMemory('proj');
    writeMemory(HARNESS_DIR, memory);
    expect(buildMemoryContext(HARNESS_DIR)).toBeNull();
  });

  test('returns context with recent sprints and stats', () => {
    appendRetrospective(HARNESS_DIR, 'proj', makeRetro({ sprintId: 'sprint-1' }));

    const ctx = buildMemoryContext(HARNESS_DIR);
    expect(ctx).not.toBeNull();
    expect(ctx!.recentSprints).toHaveLength(1);
    expect(ctx!.recentSprints[0]).toContain('sprint-1');
    expect(ctx!.stats).toContain('1 sprints');
  });

  test('limits to MAX_RECENT_SPRINTS', () => {
    for (let i = 0; i < 10; i++) {
      appendRetrospective(HARNESS_DIR, 'proj', makeRetro({ sprintId: `sprint-${i}` }));
    }

    const ctx = buildMemoryContext(HARNESS_DIR);
    expect(ctx!.recentSprints.length).toBeLessThanOrEqual(5);
  });

  test('includes knowledge entries', () => {
    appendRetrospective(HARNESS_DIR, 'proj', makeRetro());
    addKnowledge(HARNESS_DIR, 'proj', [{
      id: 'k-1',
      category: 'pattern',
      content: 'Always use strict mode',
      source: 'sprint-1',
      confidence: 0.8,
      createdAt: Date.now(),
      lastReferencedAt: Date.now(),
    }]);

    const ctx = buildMemoryContext(HARNESS_DIR);
    expect(ctx!.relevantKnowledge).toHaveLength(1);
    expect(ctx!.relevantKnowledge[0]).toContain('Always use strict mode');
  });
});

describe('formatMemoryForPrompt', () => {
  test('formats context as markdown', () => {
    const ctx = {
      recentSprints: ['[sprint-1] PASS (2 rounds, $0.050) — built: AC-1: Tests'],
      relevantKnowledge: ['[pattern] Use TypeScript (confidence: 0.8)'],
      stats: '1 sprints, 2 total rounds',
    };

    const md = formatMemoryForPrompt(ctx);
    expect(md).toContain('## 🧠 Project Memory');
    expect(md).toContain('### Recent Sprints');
    expect(md).toContain('sprint-1');
    expect(md).toContain('### Project Knowledge');
    expect(md).toContain('Use TypeScript');
    expect(md).toContain('### Stats');
  });
});

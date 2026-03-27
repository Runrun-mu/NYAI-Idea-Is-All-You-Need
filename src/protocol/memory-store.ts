import type {
  ProjectMemory,
  SprintRetrospective,
  KnowledgeEntry,
  MemoryContext,
  ProjectStats,
} from '../types/memory';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const MEMORY_FILE = 'memory.json';
const MAX_RETRO_HISTORY = 50;
const MAX_RECENT_SPRINTS = 5;
const MAX_KNOWLEDGE_ENTRIES = 20;

// ─── Read / Write ──────────────────────────────────────────────────

export function getMemoryPath(harnessDir: string): string {
  return join(harnessDir, MEMORY_FILE);
}

export function readMemory(harnessDir: string): ProjectMemory | null {
  try {
    const raw = readFileSync(getMemoryPath(harnessDir), 'utf-8');
    return JSON.parse(raw) as ProjectMemory;
  } catch {
    return null;
  }
}

export function writeMemory(harnessDir: string, memory: ProjectMemory): void {
  const path = getMemoryPath(harnessDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(memory, null, 2), 'utf-8');
}

// ─── Init ──────────────────────────────────────────────────────────

export function initMemory(projectName: string): ProjectMemory {
  const now = Date.now();
  return {
    version: 1,
    projectName,
    createdAt: now,
    updatedAt: now,
    sprints: [],
    knowledge: [],
    stats: {
      totalSprints: 0,
      totalRounds: 0,
      totalCostUsd: 0,
      passRate: 0,
      avgRoundsPerSprint: 0,
    },
  };
}

// ─── Append Retrospective ──────────────────────────────────────────

export function appendRetrospective(
  harnessDir: string,
  projectName: string,
  retro: SprintRetrospective
): void {
  let memory = readMemory(harnessDir) ?? initMemory(projectName);

  // Append retro, trim to max
  memory.sprints.push(retro);
  if (memory.sprints.length > MAX_RETRO_HISTORY) {
    memory.sprints = memory.sprints.slice(-MAX_RETRO_HISTORY);
  }

  // Update stats
  memory.stats = computeStats(memory.sprints);
  memory.updatedAt = Date.now();

  writeMemory(harnessDir, memory);
}

function computeStats(sprints: SprintRetrospective[]): ProjectStats {
  const total = sprints.length;
  if (total === 0) {
    return {
      totalSprints: 0,
      totalRounds: 0,
      totalCostUsd: 0,
      passRate: 0,
      avgRoundsPerSprint: 0,
    };
  }

  const totalRounds = sprints.reduce((sum, s) => sum + s.rounds, 0);
  const totalCostUsd = sprints.reduce((sum, s) => sum + s.costUsd, 0);
  const passCount = sprints.filter((s) => s.verdict === 'PASS').length;

  return {
    totalSprints: total,
    totalRounds,
    totalCostUsd,
    passRate: passCount / total,
    avgRoundsPerSprint: totalRounds / total,
  };
}

// ─── Knowledge Management ──────────────────────────────────────────

export function addKnowledge(
  harnessDir: string,
  projectName: string,
  entries: KnowledgeEntry[]
): void {
  let memory = readMemory(harnessDir) ?? initMemory(projectName);
  const now = Date.now();

  for (const entry of entries) {
    // Check for duplicate by content
    const existing = memory.knowledge.find(
      (k) => k.content === entry.content && k.category === entry.category
    );
    if (existing) {
      // Boost confidence when confirmed across sprints
      existing.confidence = Math.min(1, existing.confidence + 0.2);
      existing.lastReferencedAt = now;
    } else {
      memory.knowledge.push(entry);
    }
  }

  // Sort by confidence (desc), then by lastReferencedAt (desc), and trim
  memory.knowledge.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.lastReferencedAt - a.lastReferencedAt;
  });

  // Keep top entries based on a generous limit (store more, show fewer)
  if (memory.knowledge.length > MAX_RETRO_HISTORY) {
    memory.knowledge = memory.knowledge.slice(0, MAX_RETRO_HISTORY);
  }

  memory.updatedAt = now;
  writeMemory(harnessDir, memory);
}

// ─── Memory Context for Prompts ────────────────────────────────────

export function buildMemoryContext(harnessDir: string): MemoryContext | null {
  const memory = readMemory(harnessDir);
  if (!memory || memory.sprints.length === 0) {
    return null;
  }

  // Recent sprints summary (last N)
  const recentSprints = memory.sprints
    .slice(-MAX_RECENT_SPRINTS)
    .map((s) => {
      const verdict = s.verdict ?? 'N/A';
      const builtStr = s.built.length > 0 ? s.built.join(', ') : 'none';
      return `[${s.sprintId}] ${verdict} (${s.rounds} rounds, $${s.costUsd.toFixed(3)}) — built: ${builtStr}`;
    });

  // Top knowledge entries
  const relevantKnowledge = memory.knowledge
    .slice(0, MAX_KNOWLEDGE_ENTRIES)
    .map((k) => `[${k.category}] ${k.content} (confidence: ${k.confidence.toFixed(1)})`);

  // Stats summary
  const s = memory.stats;
  const stats = `${s.totalSprints} sprints, ${s.totalRounds} total rounds, $${s.totalCostUsd.toFixed(2)} total cost, ${(s.passRate * 100).toFixed(0)}% pass rate, ${s.avgRoundsPerSprint.toFixed(1)} avg rounds/sprint`;

  return { recentSprints, relevantKnowledge, stats };
}

export function formatMemoryForPrompt(ctx: MemoryContext): string {
  let md = `\n## 🧠 Project Memory\n`;

  if (ctx.recentSprints.length > 0) {
    md += `\n### Recent Sprints\n`;
    for (const s of ctx.recentSprints) {
      md += `- ${s}\n`;
    }
  }

  if (ctx.relevantKnowledge.length > 0) {
    md += `\n### Project Knowledge\n`;
    for (const k of ctx.relevantKnowledge) {
      md += `- ${k}\n`;
    }
  }

  md += `\n### Stats\n${ctx.stats}\n`;

  return md;
}

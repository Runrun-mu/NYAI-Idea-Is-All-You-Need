// ─── Project Memory Types (v0.3) ─────────────────────────────────

export interface SprintRetrospective {
  sprintId: string;
  timestamp: number;
  prompt: string;
  verdict: 'PASS' | 'FAIL' | 'PARTIAL' | null;
  rounds: number;
  costUsd: number;
  durationMs: number;
  built: string[];           // completed AC descriptions
  decisions: string[];       // key decisions made
  challenges: ChallengeRecord[];
  patterns: string[];        // code patterns discovered
  deferred: string[];        // items deferred to backlog
  passedAcs: string[];
  failedAcs: string[];
}

export interface ChallengeRecord {
  description: string;
  resolution: string;
  resolvedInRound?: number;
}

export interface ProjectMemory {
  version: 1;
  projectName: string;
  createdAt: number;
  updatedAt: number;
  sprints: SprintRetrospective[];  // max 50
  knowledge: KnowledgeEntry[];     // accumulated knowledge
  stats: ProjectStats;
}

export interface KnowledgeEntry {
  id: string;
  category: 'pattern' | 'convention' | 'gotcha' | 'decision' | 'dependency';
  content: string;
  source: string;       // sprintId
  confidence: number;   // 0-1, increases when confirmed across sprints
  createdAt: number;
  lastReferencedAt: number;
}

export interface ProjectStats {
  totalSprints: number;
  totalRounds: number;
  totalCostUsd: number;
  passRate: number;
  avgRoundsPerSprint: number;
}

export interface MemoryContext {
  recentSprints: string[];
  relevantKnowledge: string[];
  stats: string;
}

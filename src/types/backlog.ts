// ─── Backlog Types (v0.3) ────────────────────────────────────────

export interface BacklogItem {
  id: string;                    // `bl-${timestamp}`
  type: 'feature' | 'bug' | 'improvement' | 'chore';
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  sprintId?: string;             // associated sprint (filled when execution starts)
  submittedBy?: string;          // 'user' | 'evaluator' | 'planner'
  source?: string;               // origin description, e.g. "Evaluator deferred from sprint-xxx"
  tags?: string[];
}

export interface Backlog {
  version: 1;
  items: BacklogItem[];
}

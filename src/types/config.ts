import type { BackendType } from './agent';

export interface NYAIConfig {
  project: {
    name: string;
    description?: string;
    rootDir: string;
  };
  budget: {
    maxCostUsd: number;
    maxRounds: number;
    maxDurationMinutes: number;
  };
  agents: {
    planner: AgentConfig;
    generator: AgentConfig;
    evaluator: AgentConfig;
    architect?: AgentConfig;
  };
  notification?: NotificationConfig;
  autonomy: {
    autoApproveDecisions: boolean;
    autoApproveTimeoutMs: number;
  };
  backend?: BackendType;
  skipArchitect?: boolean;
  testFirst?: boolean;
  taskDecomposition?: boolean;
  gitAutoCommit?: boolean;
}

export interface AgentConfig {
  model?: string;
  maxTurns?: number;
  systemPromptPath?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  additionalArgs?: string[];
  backend?: BackendType;
}

export interface NotificationConfig {
  enabled: boolean;
  webhookUrl?: string;
  events?: string[];
}

export function defaultConfig(name: string, rootDir: string): NYAIConfig {
  return {
    project: { name, rootDir },
    budget: {
      maxCostUsd: 5.0,
      maxRounds: 10,
      maxDurationMinutes: 60,
    },
    agents: {
      planner: {
        allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Write'],
      },
      generator: {},
      evaluator: {
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'Write'],
      },
    },
    notification: { enabled: false },
    autonomy: {
      autoApproveDecisions: false,
      autoApproveTimeoutMs: 300_000,
    },
    testFirst: true,
  };
}

# NYAI 配置参考

## `.harness/config.yaml` 完整模板

```yaml
project:
  name: my-project
  description: ""
  rootDir: "."

budget:
  maxCostUsd: 5.00          # 费用上限（美元）
  maxRounds: 10             # 最大 Generate↔Evaluate 循环次数
  maxDurationMinutes: 60    # 总超时（分钟）
  # generatorTimeoutMs: 1200000  # Generator 单次超时（20min）
  # evaluatorTimeoutMs: 900000   # Evaluator 单次超时（15min）
  # plannerTimeoutMs: 900000     # Planner 单次超时（15min）

# parallelGenerators: 1     # 并行 Generator 数量
# backend: claude            # claude | codex | opencode
# skipArchitect: true        # 跳过 Architect（已有项目时使用）
# testFirst: true            # TDD 模式（默认开启）
# taskDecomposition: false   # 自动拆解需求为多个功能
# gitAutoCommit: false       # 每轮评估后自动 commit

agents:
  planner:
    allowedTools:
      - Read
      - Glob
      - Grep
      - WebSearch
      - WebFetch
      - Write
    # model: claude-sonnet-4-20250514
    # maxTurns: 30
    # systemPromptPath: custom-planner.md  # 自定义系统提示词
    # backend: claude                       # 单独指定后端

  generator: {}              # 默认拥有所有工具权限
    # maxTurns: 100
    # model: claude-sonnet-4-20250514

  evaluator:
    allowedTools:
      - Read
      - Glob
      - Grep
      - Bash
      - Write                # 仅用于写报告
    disallowedTools:
      - Edit                 # 禁止修改源代码

  # architect:
  #   maxTurns: 30
  #   allowedTools: [Read, Glob, Grep, Bash, Write, Edit]

  # deployer:
  #   maxTurns: 20
  #   allowedTools: [Read, Glob, Grep, Bash, Write]

  # reporter:
  #   maxTurns: 10
  #   allowedTools: [Read, Glob, Grep, Write]

notification:
  enabled: false
  # webhookUrl: "https://hooks.slack.com/..."
  # events: ["done", "error", "decision:needed"]

autonomy:
  autoApproveDecisions: false
  autoApproveTimeoutMs: 300000   # 5 分钟超时后自动批准
```

## TypeScript 类型定义

```typescript
interface NYAIConfig {
  project: { name: string; description?: string; rootDir: string };
  budget: {
    maxCostUsd: number;
    maxRounds: number;
    maxDurationMinutes: number;
    generatorTimeoutMs?: number;
    evaluatorTimeoutMs?: number;
    plannerTimeoutMs?: number;
  };
  parallelGenerators?: number;
  agents: {
    planner: AgentConfig;
    generator: AgentConfig;
    evaluator: AgentConfig;
    architect?: AgentConfig;
    deployer?: AgentConfig;
    reporter?: AgentConfig;
  };
  notification?: { enabled: boolean; webhookUrl?: string; events?: string[] };
  autonomy: { autoApproveDecisions: boolean; autoApproveTimeoutMs: number };
  backend?: 'claude' | 'codex' | 'opencode';
  skipArchitect?: boolean;
  testFirst?: boolean;
  taskDecomposition?: boolean;
  gitAutoCommit?: boolean;
  deploy?: { enabled: boolean; target: 'vercel' | 'custom'; customCommand?: string };
  memory?: { enabled: boolean; maxHistory?: number; maxKnowledgeInPrompt?: number };
}

interface AgentConfig {
  model?: string;
  maxTurns?: number;
  systemPromptPath?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  additionalArgs?: string[];
  backend?: 'claude' | 'codex' | 'opencode';
}
```

## 配置优先级

CLI 参数 > config.yaml > 默认值

例如 `--budget 3.00` 会覆盖 config.yaml 中的 `budget.maxCostUsd`。

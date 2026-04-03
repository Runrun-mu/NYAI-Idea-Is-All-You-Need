# NYAI `.harness/` 目录协议

## 概述

`.harness/` 目录是所有 Agent 之间的通信总线。Agent 不直接通信，而是通过读写此目录下的文件来交换信息。

## 目录结构

```
.harness/
├── config.yaml                     # 项目配置
├── state.json                      # 编排器状态（持久化，用于 resume）
├── decisions.log                   # JSONL — 所有自主决策记录
├── progress.log                    # Agent 活动时间线
├── memory.json                     # 跨 Sprint 知识库
├── backlog.json                    # 项目待办事项
├── features.json                   # 功能拆解状态（--decompose 模式）
├── architecture.json               # Architect 输出的技术栈记录
│
├── specs/
│   └── sprint-{id}.md             # Planner 输出的 Feature Spec（含验收标准 AC）
│
├── contracts/
│   └── sprint-{id}.md             # Sprint Contract（Generator/Evaluator 的执行指令）
│
├── test-plans/
│   └── sprint-{id}.json           # 测试计划（可执行测试用例列表）
│
├── critical-path/
│   └── sprint-{id}.json           # Critical Path（主用户旅程冒烟测试场景）
│
├── reports/
│   ├── sprint-{id}-round-{n}.json # 每轮 Evaluator 的评估报告
│   ├── sprint-{id}-goal-{ts}.json # Goal Acceptance 报告
│   └── progress-{ts}.html         # Reporter 生成的 HTML 仪表盘
│
├── checkpoints/
│   ├── checkpoint-{ts}.json       # 功能检查点报告（含通过/失败的 AC）
│   └── artifacts/                  # 截图、HTML 快照、测试输出等
│
└── deployments.json                # 部署历史（Vercel URL 等）
```

## 文件流转

```
Architect → architecture.json
    ↓
Planner → specs/sprint-{id}.md + test-plans/ + critical-path/ + contracts/
    ↓
Evaluator (Review) ← critical-path/  （质量门审查）
    ↓
Generator ← contracts/ + specs/ + test-plans/  → 生成代码
    ↓
Evaluator ← 代码 + test-plans/  → reports/sprint-{id}-round-{n}.json
    ↓ (循环)
Checkpoint → checkpoints/checkpoint-{ts}.json
    ↓
Goal Acceptance → reports/sprint-{id}-goal-{ts}.json
    ↓
Deployer → deployments.json
Reporter → reports/progress-{ts}.html
```

## 关键文件格式

### EvalReport（评估报告）

```json
{
  "verdict": "PASS" | "PARTIAL" | "FAIL",
  "score": 85,
  "passedAcs": ["AC-1", "AC-2"],
  "failedAcs": ["AC-3"],
  "suggestions": ["Fix responsive layout on mobile"],
  "regressions": [],
  "testResults": { "passed": 10, "failed": 2, "skipped": 0 }
}
```

### TestPlan（测试计划）

```json
{
  "testCases": [
    {
      "id": "TC-1",
      "description": "用户可以添加待办事项",
      "command": "bun test tests/todo-add.test.ts",
      "expectedResult": "All tests pass",
      "relatedAcs": ["AC-1"]
    }
  ]
}
```

### Issue Severity（问题严重级别）

| 级别 | 处理方式 |
|------|----------|
| P0 | 立即升级人工处理 |
| P1 | 升级人工处理 |
| P2 | 自动处理，标记待审 |
| P3 | 自动处理 |
| P4 | 记录，不阻塞 |

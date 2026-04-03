---
name: "nyai"
description: "NYAI (Idea Is All You Need) 自主 AI Agent 编排器的使用指南。将一句话需求转化为可部署应用。当用户提到 'nyai'、'NYAI'、'用 NYAI 跑一下'、'自动生成项目'、'agent 编排'、'从需求到部署' 时触发。"
version: "0.6.0"
license: "MIT"
allowed-tools: "Read Grep Glob Bash Write Edit"
metadata:
  author: "Runrun-mu"
  category: "ai-orchestration"
  repository: "https://github.com/Runrun-mu/NYAI-Idea-Is-All-You-Need"
---

# NYAI — Idea Is All You Need

你是一个熟悉 NYAI 编排器的专家助手。NYAI 协调 6 个专业化 AI Agent（Architect、Planner、Generator、Evaluator、Deployer、Reporter）在 GAN 式对抗反馈循环中工作，将一句话自然语言需求转化为可运行的完整应用。

## 前置要求

- **Bun** 1.3+（`curl -fsSL https://bun.sh/install | bash`）
- **Claude Code CLI** 2.1+（已认证）— 或 Codex / OpenCode 后端
- 安装：`git clone https://github.com/Runrun-mu/NYAI-Idea-Is-All-You-Need.git && cd NYAI-Idea-Is-All-You-Need && bun install`

## 核心工作流

### 1. 初始化项目

```bash
bun run src/index.ts init <project-name> -d <project-dir>
```

这会在 `<project-dir>` 下创建 `.harness/` 目录，包含 `config.yaml` 和所有必要的子目录。

### 2. 运行编排（主命令）

```bash
# TUI 交互模式（默认）
bun run src/index.ts run "<需求描述>" -d <project-dir>

# 无头模式（CI/脚本）
bun run src/index.ts run --headless "<需求描述>" -d <project-dir>

# Mock 模式（零 API 成本测试）
NYAI_MOCK_AGENTS=1 bun run src/index.ts run --headless "test"
```

### 3. 常用参数速查

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-d, --dir <dir>` | 项目根目录 | `.` |
| `--headless` | 无 TUI，纯控制台输出 | — |
| `--budget <usd>` | 最大花费（美元） | `5.00` |
| `--max-rounds <n>` | 最大 Generate↔Evaluate 轮次 | `10` |
| `--backend <type>` | `claude` / `codex` / `opencode` | `claude` |
| `--skip-architect` | 跳过 Architect 阶段 | — |
| `--no-test-first` | 禁用 TDD 模式 | — |
| `--decompose` | 自动拆解为多个功能 | — |
| `--deploy` | 成功后部署到 Vercel | — |
| `--git-auto-commit` | 每轮评估后自动 commit | — |
| `--parallel-generators <n>` | 并行 Generator 数量 | `1` |
| `--from-backlog` | 从 backlog 取下一个待办 | — |
| `--generator-timeout <ms>` | Generator 超时 | `1200000` |
| `--evaluator-timeout <ms>` | Evaluator 超时 | `900000` |

### 4. 恢复中断的 Sprint

```bash
bun run src/index.ts resume -d <project-dir>
```

### 5. 查看状态与报告

```bash
bun run src/index.ts status -d <dir>      # 编排器状态
bun run src/index.ts report -d <dir>      # 最新评估报告
bun run src/index.ts decisions -d <dir>   # 自主决策日志
bun run src/index.ts features -d <dir>    # 功能拆解状态
bun run src/index.ts memory -d <dir>      # 跨 Sprint 记忆
```

### 6. Backlog 管理

```bash
nyai backlog add "功能描述" --type feature --priority high -d <dir>
nyai backlog list -d <dir>
nyai backlog remove <id> -d <dir>
```

### 7. Watch 模式（自动消费 Backlog）

```bash
bun run src/index.ts watch -d <dir> --interval 30
```

## 6 个 Agent 角色

| Agent | 角色 | 关键职责 |
|-------|------|----------|
| 🏗️ Architect | 软件架构师 | 技术选型 → 脚手架 → 测试基础设施 |
| 📋 Planner | 产品经理 | Feature Spec + 验收标准 + 测试计划 + Critical Path |
| ⚡ Generator | 全栈工程师 | TDD 实现代码（先测试后实现） |
| 🔍 Evaluator | QA 工程师 | 运行测试 + 检查验收标准 + 回归检测 |
| 🚀 Deployer | DevOps | 自动部署到 Vercel |
| 📊 Reporter | 技术文档 | 生成 HTML 仪表盘报告 |

Agent 间通过 `.harness/` 目录的文件协议通信，每个 Agent 以独立进程运行。

## 运行生命周期（v0.6 状态机）

```
IDLE → ARCHITECTING → PLANNING → REVIEWING → CONTRACTING
    → GENERATING ↔ EVALUATING（循环直到 PASS）
    → CHECKPOINT → GOAL_ACCEPTANCE → DEPLOYING → DONE
```

关键机制：
- **Critical Path**：主用户旅程冒烟测试，每个功能完成后回归检查
- **Evaluator Review**：代码生成前的质量门审查
- **Goal Acceptance**：所有功能完成后验证整体目标
- **Incremental Replan**：目标验收失败时只补充缺失部分
- **P0-P4 Issue Severity**：P0/P1 升级人工处理

## 配置详情

详见 `references/config-reference.md`。

## .harness/ 目录协议

详见 `references/harness-protocol.md`。

## 常见使用场景

### 快速开始

```bash
bun run src/index.ts init my-app -d ./my-app
bun run src/index.ts run "创建一个待办事项应用" -d ./my-app
```

### 复杂项目（多功能拆解）

```bash
bun run src/index.ts run --decompose "做一个 MBTI 性格测试，20 道题 + 计分 + 结果页" -d ./mbti
```

### CI 流水线

```bash
bun run src/index.ts run --headless --budget 3.00 --max-rounds 5 "Create REST API" -d ./api
```

### 生成并部署

```bash
bun run src/index.ts run --deploy "Build a landing page" -d ./landing
```

### 从 Backlog 持续交付

```bash
bun run src/index.ts backlog add "添加用户认证" --type feature --priority high -d ./app
bun run src/index.ts run --from-backlog -d ./app
# 或 watch 模式
bun run src/index.ts watch -d ./app --interval 60
```

## TUI 快捷键

| 按键 | 功能 |
|------|------|
| `D` | 决策审批面板 |
| `R` | 评估报告视图 |
| `S` | Feature Spec 视图 |
| `L` | 切换日志级别 |
| `Q` | 退出 |

## 测试

```bash
bun test                    # 单元测试
bunx tsc --noEmit           # 类型检查
NYAI_MOCK_AGENTS=1 bun run src/index.ts run --headless "test"  # Mock 集成测试
```

## 技术栈

TypeScript 100% · Bun 运行时 · Ink 5 (React CLI) · Commander.js · YAML 配置 · EventEmitter 架构 · 纯函数状态机

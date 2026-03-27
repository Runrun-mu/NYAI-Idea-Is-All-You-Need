<div align="center">

# 🤖 NYAI

### _Idea Is All You Need_

**Autonomous AI Agent Orchestrator with Immersive TUI**

六个 AI Agent 自主协作，把你的一句话需求变成可运行的代码并部署上线。

[![Bun](https://img.shields.io/badge/runtime-Bun_1.3-f9a825?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Ink](https://img.shields.io/badge/TUI-Ink_5_(React)-61dafb?style=flat-square&logo=react)](https://github.com/vadimdemedes/ink)
[![Claude](https://img.shields.io/badge/LLM-Claude_Code-cc785c?style=flat-square)](https://claude.ai)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Website](https://img.shields.io/badge/website-nyaiweb.vercel.app-7c3aed?style=flat-square&logo=vercel)](https://nyaiweb.vercel.app)

<br>

```
  "做一个 MBTI 测试问卷"  ──▶  NYAI  ──▶  ✅ 完整可运行的项目
```

<br>

<img src="https://img.shields.io/badge/Planner-产品经理-blue?style=for-the-badge" /> &nbsp;
<img src="https://img.shields.io/badge/Generator-全栈工程师-green?style=for-the-badge" /> &nbsp;
<img src="https://img.shields.io/badge/Evaluator-QA工程师-orange?style=for-the-badge" /> &nbsp;
<img src="https://img.shields.io/badge/Architect-架构师-purple?style=for-the-badge" /> &nbsp;
<img src="https://img.shields.io/badge/Deployer-运维-red?style=for-the-badge" /> &nbsp;
<img src="https://img.shields.io/badge/Reporter-报告-cyan?style=for-the-badge" />

</div>

---

## ✨ What is NYAI?

NYAI 是一个 **自主 AI 编排引擎**——你只需提供一句话需求，它会自动驱动六个专业 AI Agent 协作完成开发：

| Agent | 角色 | 职责 |
|:---:|:---:|:---|
| 🏗️ **Architect** | 架构师 | 分析项目需求 → 确定技术栈 → 搭建脚手架 |
| 📋 **Planner** | 产品经理 / Tech Lead | 分析需求 → 输出 Feature Spec + 验收标准 + Test Plan |
| ⚡ **Generator** | 全栈工程师 | 读取 Spec → 编写完整代码实现（支持并行） |
| 🔍 **Evaluator** | QA 工程师 | 逐条检查验收标准 → 跑测试 → 输出评估报告 |
| 🚀 **Deployer** | DevOps 工程师 | 配置部署 → 自动部署到 Vercel → 记录部署历史 |
| 📊 **Reporter** | 技术文档 | 读取进度数据 → 生成可视化 HTML 报告 |

如果评估不通过，Generator 会根据反馈自动修复，循环直到通过——**像一个自运转的开发团队**。

### 🆕 v0.6 — Goal-Driven Convergence

v0.6 加入了**目标驱动收敛机制**，确保最终产品真正可用，而不只是单个 Feature 各自通过：

| 机制 | 说明 |
|:---:|:---|
| 🎯 **Critical Path** | Planner 输出主流程验收场景（冒烟测试），每个 Feature 完成后自动回归 |
| 📋 **Evaluator Review** | 生成前 Evaluator 先审阅 Planner 的验收标准，补充遗漏 |
| 🔁 **Cross-Feature Regression** | `previouslyPassedAcs` 跨 Feature 传递，防止后面的 Feature 把前面的改坏 |
| 📊 **Checkpoint 汇报** | 每个 Feature 完成后输出结构化报告，带 artifacts（截图/HTML 快照/测试输出） |
| ✅ **Goal Acceptance** | 所有 Feature 完成后，对标用户原始目标做最终验收 |
| 🔄 **Incremental Replan** | Goal Acceptance 失败 → Planner 只补缺失部分，不重做 |
| 🚨 **P0-P4 Issue Severity** | 问题分 5 级，P0/P1 自动升级给人决策，P2+ 自动处理 |

## 🏗 Architecture

```
                         ┌─────────────────────────────────────────┐
                         │            NYAI Orchestrator           │
                         │          (EventEmitter 驱动)            │
                         └──────────────────┬──────────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
              ┌─────▼─────┐          ┌──────▼──────┐         ┌─────▼─────┐
              │  Planner   │          │  Generator  │         │ Evaluator │
              │  (Claude)  │          │  (Claude)   │         │ (Claude)  │
              └─────┬──────┘          └──────┬──────┘         └─────┬─────┘
                    │                        │                      │
                    ▼                        ▼                      ▼
             Feature Spec              Code Files             Eval Report
             Critical Path 🆕      (直接写入项目)         (PASS/FAIL/PARTIAL)
             Sprint Contract                                 Review 🆕
                    │                        │                      │
                    └────────────────────────┼──────────────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │   FAIL? → 重试   │
                                    │   PASS? → 检查点 🆕│
                                    │   ALL? → 目标验收🆕│
                                    └─────────────────┘
```

**核心设计：Orchestrator = EventEmitter**

```typescript
orchestrator.emit('state:change', { from, to })
orchestrator.emit('agent:start',  { role, round })
orchestrator.emit('agent:log',    { role, line })     // ← Agent stderr 实时流
orchestrator.emit('agent:done',   { role, result })
orchestrator.emit('eval:verdict', { verdict, report })
orchestrator.emit('cost:update',  { spent, budget })
orchestrator.emit('done',         { summary })
```

TUI 和 Headless 是**可替换的展示层**，核心逻辑完全解耦。

## 🖥 TUI 体验

沉浸式全屏终端界面（基于 Ink 5 / React for CLI）：

```
╔═══════════════════════════════════════╗
║          🤖 NYAI Orchestrator        ║
╚═══════════════════════════════════════╝

 ┌──── Agents ────┐  ┌──────────── Logs ─────────────────────┐
 │                 │  │                                       │
 │ ✅ 📋 Planner   │  │ [planner] Drafting feature spec...    │
 │    Completed    │  │ [planner] ✅ Spec and contract ready. │
 │                 │  │ [generator] Scaffolding project...    │
 │ 🔄 ⚡ Generator │  │ [generator] Implementing core logic.. │
 │    Running...   │  │ [generator] Writing tests...          │
 │                 │  │ [generator] ✅ Implementation done.   │
 │ ⏳ 🔍 Evaluator │  │                                       │
 │    Waiting...   │  │                                       │
 │                 │  │                                       │
 └─────────────────┘  └───────────────────────────────────────┘
 ┌────────────────────────────────────────────────────────────┐
 │ State: GENERATING │ Round: 1 │ Cost: $0.35 / $5.00 │ 2m 15s│
 │ D:decisions  R:report  S:spec  L:logs  Q:quit             │
 └────────────────────────────────────────────────────────────┘
```

**快捷键**：`D` 决策审批 · `R` 评估报告 · `S` 查看 Spec · `L` 日志级别 · `Q` 退出 · `Ctrl+C` 中止

## 🚀 Quick Start

### 前置条件

- [Bun](https://bun.sh) 1.3+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 2.1+（已认证）

### 安装

```bash
git clone https://github.com/Runrun-mu/NYAI-Idea-Is-All-You-Need.git
cd NYAI-Idea-Is-All-You-Need
bun install
```

### 使用

```bash
# 初始化项目
bun run src/index.ts init my-project -d ./my-project

# TUI 模式运行（交互式）
bun run src/index.ts run "创建一个 Todo List 应用"

# Headless 模式（CI/脚本）
bun run src/index.ts run --headless "创建一个 Todo List 应用"

# Mock 模式（开发测试，不消耗 API）
NYAI_MOCK_AGENTS=1 bun run src/index.ts run --headless "测试"

# 查看状态
bun run src/index.ts status
bun run src/index.ts report
bun run src/index.ts decisions
```

### CLI 命令

| 命令 | 说明 |
|:-----|:-----|
| `nyai init [name]` | 初始化 `.harness/` 配置目录 |
| `nyai run "<prompt>"` | TUI 模式运行 |
| `nyai run --headless "<prompt>"` | 无 UI 模式运行 |
| `nyai run --deploy "<prompt>"` | 构建完成后自动部署到 Vercel |
| `nyai run --decompose "<prompt>"` | 自动拆分多个 Feature |
| `nyai status` | 查看当前状态 |
| `nyai report` | 查看最新评估报告 |
| `nyai decisions` | 查看自治决策日志 |

## 📁 Project Structure

```
NYAI/
├── src/
│   ├── index.ts                    # CLI 入口 (Commander.js)
│   ├── types/                      # TypeScript 类型定义
│   │   ├── state.ts                #   状态机类型
│   │   ├── config.ts               #   配置类型
│   │   ├── agent.ts                #   Agent 类型
│   │   ├── protocol.ts             #   协议类型 (Spec/Report)
│   │   └── events.ts               #   事件联合类型
│   ├── core/                       # 核心引擎
│   │   ├── orchestrator.ts         #   编排器 (EventEmitter)
│   │   ├── state-machine.ts        #   纯函数状态机
│   │   └── cost-tracker.ts         #   成本追踪
│   ├── agents/                     # Agent 层
│   │   ├── agent-runner.ts         #   Bun.spawn + stderr 流式
│   │   ├── planner.ts              #   Planner prompt 构建
│   │   ├── generator.ts            #   Generator prompt 构建
│   │   └── evaluator.ts            #   Evaluator prompt 构建
│   ├── protocol/                   # 文件协议层
│   │   ├── file-protocol.ts        #   .harness/ 文件读写
│   │   ├── state-store.ts          #   state.json 持久化
│   │   └── decision-logger.ts      #   decisions.log
│   ├── tui/                        # TUI 展示层 (Ink 5 / React)
│   │   ├── App.tsx                 #   根组件
│   │   ├── components/             #   UI 组件
│   │   └── hooks/                  #   React Hooks
│   ├── headless/                   # Headless 展示层
│   └── prompts/                    # System Prompts
├── examples/                       # 示例项目
│   ├── mbti-quiz/                  #   MBTI 性格测试（NYAI 生成）
│   └── agent-admin/                #   Agent 管理后台（NYAI 生成）
├── tests/                          # 单元测试
└── templates/                      # 配置模板
```

## 🧪 Testing

```bash
# 运行全部测试（212 个）
bun test

# Mock 模式全流程测试
NYAI_MOCK_AGENTS=1 bun run src/index.ts run --headless "测试需求"
```

## 📦 Examples

### Example 1: MBTI 性格测试问卷

```bash
nyai run "构建一个MBTI性格测试问卷系统，20道题，自动计算16种人格类型"
```

**结果**：619 行 HTML，20/20 AC 通过，评分 95/100，一轮完成

→ [`examples/mbti-quiz/`](examples/mbti-quiz/)

### Example 2: Agent 后台管理系统

```bash
nyai run "构建 AI Agent 后台管理系统，支持增删改查，深色主题 Dashboard，Mock 数据"
```

**结果**：15 个文件 / 2,551 行代码，35/35 AC 通过，评分 97/100，一轮完成

→ [`examples/agent-admin/`](examples/agent-admin/)

## ⚙️ Configuration

`.harness/config.yaml`：

```yaml
project:
  name: my-project

budget:
  maxCostUsd: 5.00        # 成本上限
  maxRounds: 10            # 最大 Generate↔Evaluate 轮次
  maxDurationMinutes: 60   # 超时时间

agents:
  planner:
    allowedTools: [Read, Glob, Grep, WebSearch, WebFetch, Write]
  generator: {}            # 全工具访问
  evaluator:
    allowedTools: [Read, Glob, Grep, Bash, Write]

autonomy:
  autoApproveDecisions: false
  autoApproveTimeoutMs: 300000
```

## 🔑 Key Design Decisions

| 决策 | 选择 | 理由 |
|:-----|:-----|:-----|
| 核心↔UI 通信 | EventEmitter | 解耦：Orchestrator 不感知展示层 |
| TUI 框架 | Ink 5 (React) | Claude Code 验证了 Ink + Bun 兼容性 |
| Agent 底座 | `claude -p` CLI | 独立进程 = 独立上下文，stderr 提供实时日志 |
| 运行时 | Bun | 原生 TS、快速启动、内置测试 |
| 状态机 | 纯函数 | 无副作用，100% 可测试 |
| Mock 模式 | `NYAI_MOCK_AGENTS=1` | 开发/测试零 API 成本 |

## 🎯 v0.6 State Machine

```
IDLE → ARCHITECTING → PLANNING → REVIEWING → CONTRACTING → GENERATING ↔ EVALUATING
                                                                ↓              ↓
                                                           REPLANNING    CHECKPOINT
                                                                            ↓
                                                                    GOAL_ACCEPTANCE
                                                                      ↓         ↓
                                                                    DONE    PLANNING (增量修复)
                                                                              ↓
                                                                           BLOCKED (P0/P1 升级)
```

### 完整生命周期

1. **PLANNING** — Planner 输出 Spec + TestPlan + CriticalPath
2. **REVIEWING** — Evaluator 审阅 CriticalPath，补充遗漏
3. **GENERATING ↔ EVALUATING** — 代码生成 + 验收循环（每个 Feature）
4. **CHECKPOINT** — 每个 Feature PASS 后，跑 CriticalPath 回归
5. **GOAL_ACCEPTANCE** — 所有 Feature 完成后，最终产品验收
6. **DONE** 或 **增量修复** — Goal PASS → 完成；FAIL → Planner 补缺失部分

## 📄 License

MIT

---

<div align="center">

**Built with ❤️ by NYAI Team**

_Idea Is All You Need — 让 AI 团队为你编码_

</div>

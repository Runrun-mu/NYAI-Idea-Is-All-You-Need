# GanAI: 多 Agent 自主编程系统技术设计文档

> 版本: v0.1 Draft
> 日期: 2026-03-25
> 作者: AI-Assisted Architecture Design

---

## 目录

1. [系统概述](#1-系统概述)
2. [核心设计理念](#2-核心设计理念)
3. [系统架构](#3-系统架构)
4. [Agent 详细设计](#4-agent-详细设计)
5. [Agent 间通信协议](#5-agent-间通信协议)
6. [编排引擎设计](#6-编排引擎设计)
7. [用户介入机制](#7-用户介入机制)
8. [自治决策策略](#8-自治决策策略)
9. [产品最终形态](#9-产品最终形态)
10. [技术选型与部署](#10-技术选型与部署)
11. [搭建指南](#11-搭建指南)
12. [风险与限制](#12-风险与限制)

---

## 1. 系统概述

### 1.1 是什么

GanAI 是一个受 GAN（生成对抗网络）启发的多 Agent 自主编程系统。用户只需提供 1-4 句自然语言需求描述，系统即可在数小时内自主完成完整全栈应用的规划、编码、测试和交付。

### 1.2 解决什么问题

当前单一 AI Agent 写代码存在三个根本问题：

- **视野局限**：一个 Agent 同时承担规划、编码、测试三种角色，容易陷入局部最优。写代码的人不应该自己验收。
- **上下文退化**：长时间运行的单 Agent 会在上下文窗口耗尽后丧失前期设计意图，越写越偏。
- **没有对抗压力**：没有独立的评估者，代码质量完全依赖模型自身的"自觉性"，缺乏系统性保障。

### 1.3 核心思路

不让一个 Agent 干所有事。像真实软件团队一样分工：

- **Planner** = 产品经理，负责需求分析和功能规格
- **Generator** = 全栈工程师，负责编码实现
- **Evaluator** = QA 工程师，负责测试和验收

三个角色通过**文件系统通信**协作，由**编排引擎**控制流转，形成 Generator 与 Evaluator 之间的**对抗式反馈循环**，持续逼近质量目标。

---

## 2. 核心设计理念

### 2.1 GAN 式对抗分离

系统的灵魂是 Generator 和 Evaluator 之间的对抗关系。

Generator 的目标是"让 Evaluator 通过"。Evaluator 的目标是"找到所有问题"。两者对抗迭代，质量螺旋上升。与 GAN 的区别在于：这里不是梯度反馈，而是自然语言反馈——Evaluator 会输出具体的 bug 描述、失败的测试用例、不符合验收标准的条目，Generator 根据这些反馈修复代码。

关键约束：Generator 和 Evaluator **必须是独立的 Agent 实例**，拥有各自的上下文窗口。如果是同一个实例的不同角色扮演，对抗效果会大打折扣（自己很难真正否定自己）。

### 2.2 Sprint Contract（冲刺合约）

高层 Feature Spec 和具体代码之间存在巨大鸿沟。Sprint Contract 是填补这个鸿沟的桥梁。

Contract 明确列出：
- 这一轮要交付什么
- 每个交付物的验收标准是什么
- 验收标准必须是**可执行的**（比如"点击登录按钮后应跳转到 /dashboard"，而不是"登录功能应该好用"）

Contract 由 Planner 起草，Generator 和 Evaluator 协商确认。一旦确认，Evaluator 严格按照 Contract 评分，Generator 以 Contract 作为实现目标。

### 2.3 文件系统即消息总线

Agent 之间不通过 API 调用或内存共享通信。所有通信都通过文件系统中的结构化文档完成。

为什么这样设计：
- **天然持久化**：进程崩溃、重启后所有状态都在。
- **可审计**：每一步交互都是文件，可 git track，可回溯。
- **解耦**：Agent 之间零依赖，替换任何一个 Agent 的实现不影响其他。
- **人可读**：用户随时可以打开文件看到当前状态，不是黑盒。

### 2.4 AI 永远不傻等

系统的另一个核心原则：当需要用户决策但用户不在线时，AI 不阻塞。采用"安全默认 + 标记待审"策略继续推进，最终交付时让用户一次性审查所有自治决策。

---

## 3. 系统架构

系统分为四层：

### 3.1 用户层 (User Layer)

用户与系统的交互界面。MVP 阶段是 CLI + 文件浏览，后期演进为 Web Dashboard。

职责：
- 提交需求
- 接收关键决策通知
- 审批阻塞性问题
- 查看进度和决策日志
- 最终验收

### 3.2 控制层 (Control Layer)

系统的大脑，即编排引擎。

职责：
- 维护状态机，控制 Agent 流转
- 执行决策策略（什么该问用户，什么可以自治）
- 管理审批队列
- 成本控制（监控 token 消耗，超预算时暂停）
- 超时和重试管理

### 3.3 Agent 层 (Agent Layer)

三个独立的 Claude Code 实例，每个有自己的角色 prompt、工具权限和上下文窗口。

### 3.4 持久层 (Data Layer)

文件系统 + Git 仓库，承载所有通信产物和项目代码。

---

## 4. Agent 详细设计

### 4.1 Planner Agent

**角色定位**：产品经理 + 系统架构师

**输入**：用户原始需求 (1-4 句话)

**输出**：
- `specs/feature-spec.md` — 完整功能规格文档
- `specs/tech-decisions.md` — 技术选型及理由
- `specs/sprint-contracts/sprint-001.md` — 第一个 Sprint Contract

**System Prompt 要点**：

```
你是一个资深产品经理兼系统架构师。你的职责是将模糊的用户需求转化为
清晰、完整、可执行的功能规格文档。

规则：
1. 功能描述必须具体到用户交互层面（点击什么 → 看到什么 → 数据如何变化）
2. 每个功能必须附带可执行的验收标准
3. 验收标准必须是 QA 工程师可以用 Playwright 自动化测试的
4. 主动识别用户未提及但必要的功能（如错误处理、空状态、加载状态）
5. 如果需求存在矛盾或模糊之处，明确列出并给出你的建议方案
6. 技术选型遵循"最小惊讶原则"——选行业最常见、文档最全的方案
```

**工具权限**：只读（Read、Glob、Grep、WebSearch）。Planner 不写代码。

**运行时长**：通常 2-5 分钟

### 4.2 Generator Agent

**角色定位**：全栈工程师

**输入**：
- Feature Spec
- Sprint Contract
- 上一轮 Evaluator 反馈（如果有）

**输出**：
- 项目源代码（git commit）
- `reports/generator-self-check.md` — 自检报告

**System Prompt 要点**：

```
你是一个全栈工程师。你根据 Feature Spec 和 Sprint Contract 实现功能。

规则：
1. 严格按照 Sprint Contract 中的交付物逐个实现，不要擅自扩展范围
2. 每实现一个功能，先自测再继续。自测方式：启动应用，用 curl 或浏览器验证
3. 如果收到 Evaluator 反馈，优先修复反馈中的问题，而非实现新功能
4. 每个有意义的变更都要 git commit，commit message 说明改了什么
5. 遇到无法解决的技术问题时，写入 reports/blockers.md 并继续其他任务
6. 遇到需要用户决策的设计问题时，选择最常规的方案，并在代码中加
   TODO(USER_REVIEW) 注释
7. 不要直接修改 specs/ 目录下的文件
```

**工具权限**：完整（Read、Write、Edit、Bash、Glob、Grep）

**运行时长**：10-60 分钟/轮，可能跑多轮

### 4.3 Evaluator Agent

**角色定位**：QA 工程师

**输入**：
- Sprint Contract（作为评分标准）
- 当前项目代码（通过文件系统访问）

**输出**：
- `reports/eval-sprint-001-round-N.md` — 评估报告

**System Prompt 要点**：

```
你是一个严格的 QA 工程师。你根据 Sprint Contract 测试当前构建的应用。

规则：
1. 启动应用（npm run dev / python main.py 等），在浏览器中实际交互测试
2. 使用 Playwright 编写并运行自动化测试
3. 对 Contract 中的每一条验收标准逐项评分：PASS / FAIL / PARTIAL
4. FAIL 和 PARTIAL 必须附带：
   a. 具体的复现步骤
   b. 期望行为 vs 实际行为
   c. 截图路径（如适用）
   d. 严重程度：BLOCKER / MAJOR / MINOR
5. 除了 Contract 条目，还要检查：
   a. 控制台是否有报错
   b. 页面是否有明显的视觉问题
   c. 基本的边界情况（空输入、超长输入、网络错误）
6. 最终给出总体判定：PASS（全部通过）或 FAIL（存在 BLOCKER 或 MAJOR）
7. 你只负责测试和报告，不要修改任何源代码
```

**工具权限**：只读 + Bash（用于启动应用和运行测试）。不允许 Write/Edit。

**运行时长**：5-15 分钟/轮

---

## 5. Agent 间通信协议

### 5.1 目录结构

```
project-root/
├── .harness/                     # 系统工作目录
│   ├── config.yaml               # 系统配置
│   ├── state.json                # 编排引擎状态
│   ├── decisions.log             # 自治决策日志
│   │
│   ├── specs/                    # Planner 输出
│   │   ├── feature-spec.md       # 功能规格文档
│   │   ├── tech-decisions.md     # 技术选型记录
│   │   └── sprint-contracts/     # Sprint Contracts
│   │       ├── sprint-001.md
│   │       └── sprint-002.md
│   │
│   ├── reports/                  # 各 Agent 报告
│   │   ├── generator-self-check.md
│   │   ├── eval-sprint-001-round-1.md
│   │   ├── eval-sprint-001-round-2.md
│   │   └── blockers.md           # 阻塞问题
│   │
│   └── prompts/                  # Agent System Prompts
│       ├── planner.md
│       ├── generator.md
│       └── evaluator.md
│
├── src/                          # Generator 生成的源代码
├── tests/                        # Evaluator 生成的测试
├── package.json / requirements.txt
└── ...
```

### 5.2 通信产物格式

所有 Agent 间通信通过 Markdown 文件完成。每种文件有固定格式。

#### Feature Spec 格式

```markdown
# Feature Spec: [项目名称]

## 概述
[一段话描述这个产品是什么，解决什么问题]

## 技术栈
- 前端: [xxx]
- 后端: [xxx]
- 数据库: [xxx]
- 其他: [xxx]

## 功能列表

### F-001: [功能名称]
**描述**: [用户视角的功能描述]
**用户流程**:
1. 用户 [做什么]
2. 系统 [响应什么]
3. 用户 [看到什么]

**验收标准**:
- [ ] AC-001: [具体的、可测试的标准]
- [ ] AC-002: [具体的、可测试的标准]

**边界情况**:
- [空状态怎么处理]
- [错误怎么处理]

### F-002: ...
```

#### Sprint Contract 格式

```markdown
# Sprint Contract: Sprint-001

## 目标
[这个 Sprint 要交付什么]

## 交付物

### D-001: [交付物名称]
**对应功能**: F-001
**验收标准**:
- [ ] AC-001: 打开首页，应看到 [xxx]
- [ ] AC-002: 点击 [xxx] 按钮，应 [xxx]
**优先级**: P0 / P1 / P2

### D-002: ...

## 完成定义
- 所有 P0 交付物的验收标准全部 PASS
- 所有 P1 交付物的验收标准 ≥80% PASS
- 无 BLOCKER 级别 bug
- 应用可以正常启动，无控制台报错
```

#### 评估报告格式

```markdown
# Evaluation Report: Sprint-001, Round 1

## 总体判定: PASS / FAIL

## 逐项评估

### D-001: [交付物名称]
| AC 编号 | 描述 | 结果 | 严重程度 |
|---------|------|------|----------|
| AC-001  | xxx  | PASS | -        |
| AC-002  | xxx  | FAIL | BLOCKER  |

**AC-002 失败详情**:
- 复现步骤: [1. xxx  2. xxx  3. xxx]
- 期望行为: [xxx]
- 实际行为: [xxx]

### D-002: ...

## 额外发现
- [不在 Contract 中但需要注意的问题]

## 统计
- 总验收标准: N
- PASS: X
- FAIL: Y
- PARTIAL: Z
- 通过率: X/N = xx%
```

#### 自治决策日志格式

```markdown
# Autonomous Decisions Log

## Decision #001
- **时间**: 2026-03-25 14:32
- **Agent**: Generator
- **上下文**: [遇到了什么决策点]
- **选项**: A) [xxx]  B) [xxx]  C) [xxx]
- **选择**: [选了哪个]
- **理由**: [为什么]
- **可逆性**: 高/中/低 — [说明]
- **需要用户确认**: 是/否

## Decision #002
...
```

### 5.3 通信流程

Agent 之间的通信遵循严格的单向依赖：

```
Planner 写入 specs/ → Generator 读取 specs/、写入 src/ 和 reports/
                    → Evaluator 读取 specs/ 和 src/、写入 reports/
                    → Generator 读取 reports/ 中的评估反馈
```

规则：
- Planner 不读取 reports/（不关心实现细节）
- Generator 不修改 specs/（不改需求）
- Evaluator 不修改 src/（不改代码）
- 所有 Agent 只通过约定的文件路径交换信息，不直接调用其他 Agent

---

## 6. 编排引擎设计

### 6.1 状态机定义

编排引擎维护一个状态机，定义系统在任意时刻处于以下哪个状态：

```
INIT → PLANNING → CONTRACTING → GENERATING → EVALUATING
                                     ↑            ↓
                                     └── FIXING ←─┘ (FAIL)
                                                   ↓ (PASS)
                                              REVIEWING → DONE
```

状态转移规则：

| 当前状态 | 触发条件 | 下一状态 |
|----------|---------|---------|
| INIT | 用户提交需求 | PLANNING |
| PLANNING | Planner 输出 spec + contract | CONTRACTING |
| CONTRACTING | 合约确认（用户确认或自动确认） | GENERATING |
| GENERATING | Generator 完成自检并提交 | EVALUATING |
| EVALUATING + PASS | 评估通过 | REVIEWING |
| EVALUATING + FAIL | 评估失败且轮次 < max | FIXING |
| EVALUATING + FAIL | 评估失败且轮次 ≥ max | ESCALATE（通知用户） |
| FIXING | Generator 修复完成 | EVALUATING |
| REVIEWING | 用户确认或自动确认 | DONE |

### 6.2 state.json 格式

```json
{
  "project_id": "proj_abc123",
  "current_state": "GENERATING",
  "current_sprint": "sprint-001",
  "current_round": 2,
  "max_rounds": 5,
  "cost_budget_usd": 50.0,
  "cost_spent_usd": 12.35,
  "user_online": false,
  "pending_decisions": [
    {
      "id": "dec_001",
      "question": "状态管理使用 Redux 还是 Zustand？",
      "options": ["Redux", "Zustand"],
      "default": "Zustand",
      "auto_resolved": true,
      "auto_choice": "Zustand",
      "needs_user_confirm": true
    }
  ],
  "history": [
    {"state": "INIT", "timestamp": "2026-03-25T14:00:00Z"},
    {"state": "PLANNING", "timestamp": "2026-03-25T14:00:05Z", "duration_sec": 180},
    {"state": "CONTRACTING", "timestamp": "2026-03-25T14:03:05Z", "duration_sec": 10},
    {"state": "GENERATING", "timestamp": "2026-03-25T14:03:15Z"}
  ]
}
```

### 6.3 编排引擎核心逻辑（伪代码）

```python
class Orchestrator:
    def run(self, user_prompt: str):
        self.state = "INIT"
        self.round = 0

        # Phase 1: Planning
        self.transition("PLANNING")
        spec = self.run_agent("planner", {
            "prompt": user_prompt,
            "output_files": ["specs/feature-spec.md", "specs/tech-decisions.md"]
        })

        # 检查是否有需要用户确认的架构决策
        if spec.has_ambiguities():
            if self.user_online():
                self.ask_user(spec.ambiguities)
            else:
                self.auto_resolve(spec.ambiguities)  # 选默认 + 记日志

        contract = self.run_agent("planner", {
            "task": "generate_contract",
            "input_files": ["specs/feature-spec.md"],
            "output_files": ["specs/sprint-contracts/sprint-001.md"]
        })

        self.transition("CONTRACTING")
        # 简单项目自动确认，复杂项目请求用户确认
        if self.project_complexity() > THRESHOLD:
            self.request_user_approval("sprint_contract")

        # Phase 2: Generate-Evaluate Loop
        while self.round < self.max_rounds:
            self.round += 1

            self.transition("GENERATING")
            feedback_file = f"reports/eval-sprint-001-round-{self.round - 1}.md"
            self.run_agent("generator", {
                "input_files": [
                    "specs/feature-spec.md",
                    "specs/sprint-contracts/sprint-001.md",
                    feedback_file if self.round > 1 else None
                ]
            })

            self.transition("EVALUATING")
            eval_result = self.run_agent("evaluator", {
                "input_files": ["specs/sprint-contracts/sprint-001.md"],
                "output_files": [f"reports/eval-sprint-001-round-{self.round}.md"]
            })

            if eval_result.verdict == "PASS":
                break

            if self.round >= self.max_rounds:
                self.escalate_to_user("连续评估失败，需要人工介入")
                break

            # 检查是否卡住（连续两轮同样的问题）
            if self.is_stuck():
                self.escalate_to_user("检测到相同问题重复出现")
                break

            self.transition("FIXING")

        # Phase 3: Review
        self.transition("REVIEWING")
        if self.has_pending_decisions():
            self.present_decisions_for_review()

        self.transition("DONE")
```

---

## 7. 用户介入机制

### 7.1 三级介入模型

用户介入分为三个级别，决定了系统的行为：

**Level 0 — 纯自治**

适用场景：
- 代码实现细节（变量命名、函数拆分）
- Bug 修复（Evaluator 报告的问题）
- 文件组织和项目结构
- 依赖安装
- 测试编写

AI 行为：直接执行，不通知用户。仅在 git log 中可追溯。

**Level 1 — 自治 + 记录**

适用场景：
- UI/UX 风格选择（颜色、布局）
- 多种等价实现路径选择
- 第三方库选择
- 性能 vs 可读性权衡

AI 行为：
1. 选择"最小惊讶"方案
2. 将决策写入 `decisions.log`
3. 在代码中加 `// TODO(USER_REVIEW): 选择了 Zustand 而非 Redux，原因见 decisions.log #003`
4. 将选择外化为配置项（方便后续更改）
5. 继续执行

**Level 2 — 必须用户介入**

适用场景：
- 需求模糊或矛盾
- 架构级决策（数据库类型、是否需要认证）
- 涉及外部服务（支付、邮件、第三方 API 密钥）
- 安全敏感操作
- 连续 N 轮评估失败
- 成本超预算

AI 行为：
1. 将问题写入审批队列
2. 通过配置的通知渠道（Slack / 邮件 / Webhook）通知用户
3. **不阻塞整体流程**——跳过该功能，继续处理其他不依赖此决策的功能
4. 用户回复后，重新处理被跳过的功能

### 7.2 用户介入的异步模式

关键设计：用户是"异步审批者"，不是"实时监工"。

系统发出通知后不阻塞等待。具体策略：

```
遇到 Level 2 决策
  ├─ 用户在线 → 推送通知，等待最多 5 分钟
  │   ├─ 用户回复 → 按用户意图执行
  │   └─ 超时 → 降级为 Level 1 策略（选默认 + 记日志）
  │
  └─ 用户离线 → 直接降级为 Level 1 策略
      └─ 标记为 PENDING_USER_REVIEW
```

所有降级决策在交付时汇总呈现，用户一次性审查。

### 7.3 通知设计

通知应该惜字如金。用户不应该被 AI 的每一个小问题打扰。

**值得通知的**：
- 项目规划完成，请确认 Sprint Contract
- 遇到无法自动解决的阻塞问题
- 评估连续失败
- 成本即将超预算
- 项目完成，请验收

**不值得通知的**：
- Agent 切换
- 单次评估结果
- 代码 commit
- 自治决策记录

---

## 8. 自治决策策略

当用户不在场时，AI 遵循以下决策框架：

### 8.1 四个原则（按优先级排序）

**原则一：最小惊讶**

选择行业内最常见、最主流的方案。不选新奇、小众、实验性的方案。

示例：
- 需要状态管理 → 选 Zustand（React 生态最流行的轻量方案）而不是 Jotai
- 需要 CSS 方案 → 选 Tailwind（使用最广泛）而不是 vanilla-extract
- 需要 ORM → 选 Prisma（生态最好）而不是 Drizzle

**原则二：可逆性优先**

在两个差不多的方案间选择时，选更容易改回来的那个。

示例：
- 文件结构选择 → 选扁平结构（容易重组）而不是深层嵌套
- API 设计 → 先用 REST（可以后加 GraphQL 层）而不是直接上 GraphQL
- 数据库 → 先用 SQLite（零配置，可迁移到 PostgreSQL）

**原则三：参数化**

把主观选择外化为配置，让用户后续可以轻松修改。

示例：
- 颜色方案 → 抽取到 `theme.config.ts`
- API 地址 → 放在 `.env`
- 功能开关 → 放在 `features.config.ts`

**原则四：标记待审**

在代码中留下清晰的标记，让用户在 review 时能快速定位所有 AI 自主做的决策。

标记格式：
```
// TODO(USER_REVIEW): [简短说明]
// See decisions.log #[编号] for details
```

---

## 9. 产品最终形态

### 9.1 MVP（第一阶段）

**形态**：CLI 工具 + 文件系统

**使用方式**：

```bash
# 安装
npm install -g ganai

# 初始化项目
ganai init my-app

# 启动自主编程
ganai run "一个带用户认证的个人博客系统，支持 Markdown 编辑和标签分类"

# 查看进度
ganai status

# 查看 AI 做了哪些自主决策
ganai decisions

# 介入回答问题
ganai respond

# 查看评估报告
ganai report
```

**用户体验**：
1. 用户运行 `ganai run "需求描述"`
2. 终端实时显示当前阶段（Planning → Generating → Evaluating → ...）
3. 遇到需要用户决策的问题时，终端弹出提示（如果用户在看），或发送通知（如果配置了 Slack/邮件）
4. 完成后，终端显示总结报告和决策审查列表
5. 用户在生成的项目目录中 `npm run dev` 启动应用

**技术实现**：
- CLI 用 Node.js (Commander.js) 或 Python (Click)
- Agent 通过 `claude -p` 命令调用
- 编排逻辑用 Python/Node.js 状态机
- 通知用 Slack Webhook 或 ntfy.sh

### 9.2 成长期（第二阶段）

**形态**：Web Dashboard + 后台服务

**新增能力**：
- Web UI 实时展示项目进度（类似 CI/CD 面板）
- 可视化编排流程——看到每个 Agent 在做什么
- 审批队列——类似 PR Review 的体验，用户点击 Approve / Request Changes
- 历史项目管理——查看之前生成的所有项目
- 模板系统——常见项目类型预置 Spec 模板
- 多 Sprint 支持——大项目自动拆分为多个 Sprint 串行执行

**技术实现**：
- 前端：Next.js + Tailwind
- 后端：FastAPI / Node.js
- 任务队列：Redis + Bull / Celery
- 数据库：PostgreSQL（存项目元数据、决策日志）
- 实时通信：WebSocket / SSE（进度推送）
- Agent 运行：容器化（每个 Agent 一个 Docker 容器）

### 9.3 成熟期（第三阶段）

**形态**：团队协作平台

**新增能力**：
- 多人协作——多个用户可以同时介入同一个项目
- Agent 市场——社区贡献的专业 Agent（如"安全审计 Agent""性能优化 Agent"）
- 自定义 Agent Pipeline——用户可以拖拽编排自己的 Agent 工作流
- 持续演进——生成的项目不是一次性的，用户可以说"给这个项目加一个评论功能"，系统在原有项目基础上继续迭代
- 学习记忆——系统记住用户的偏好（喜欢的技术栈、代码风格），后续项目自动应用

---

## 10. 技术选型与部署

### 10.1 MVP 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 编排引擎 | Python 3.11+ | 生态丰富，适合脚本编排 |
| Agent 运行时 | Claude Code CLI (`claude -p`) | 开箱即用，不需要自建 Agent 框架 |
| 状态管理 | 文件系统 (JSON + Markdown) | 零依赖，可 git 追踪 |
| 通知 | ntfy.sh / Slack Webhook | 零成本，配置简单 |
| 版本控制 | Git | 每一步可回溯 |
| CLI 框架 | Python Click | 快速构建命令行界面 |

### 10.2 MVP 运行环境要求

- macOS / Linux
- Python 3.11+
- Node.js 18+（如果生成前端项目）
- Claude Code CLI 已安装并认证
- Git

### 10.3 成本模型

基于 Anthropic 文章中的数据参考：

| 项目规模 | 预计耗时 | 预计成本 | Planner | Generator | Evaluator |
|----------|---------|---------|---------|-----------|-----------|
| 小型（单页应用） | 30 分钟 | $5-15 | 1 轮 | 1-2 轮 | 1-2 轮 |
| 中型（多页 CRUD） | 2-3 小时 | $30-80 | 1 轮 | 3-5 轮 | 3-5 轮 |
| 大型（完整 SaaS） | 4-8 小时 | $100-300 | 1-2 轮 | 5-10 轮 | 5-10 轮 |

---

## 11. 搭建指南

### 11.1 第一步：项目初始化

```bash
mkdir ganai && cd ganai
python -m venv venv && source venv/bin/activate
pip install click pyyaml
```

目录结构：

```
ganai/
├── cli.py              # CLI 入口
├── orchestrator.py     # 编排引擎
├── agents/
│   ├── base.py         # Agent 基类
│   ├── planner.py      # Planner Agent
│   ├── generator.py    # Generator Agent
│   └── evaluator.py    # Evaluator Agent
├── comms/
│   ├── file_protocol.py  # 文件通信协议
│   └── notifier.py       # 通知发送
├── prompts/
│   ├── planner.md      # Planner System Prompt
│   ├── generator.md    # Generator System Prompt
│   └── evaluator.md    # Evaluator System Prompt
├── config.yaml         # 默认配置
└── templates/          # Sprint Contract 等文件模板
```

### 11.2 第二步：实现 Agent 基类

Agent 基类封装了 Claude Code CLI 的调用：

```python
# agents/base.py
import subprocess
import json
import os

class Agent:
    def __init__(self, name: str, prompt_file: str, allowed_tools: list[str]):
        self.name = name
        self.prompt_file = prompt_file
        self.allowed_tools = allowed_tools

    def run(self, task_prompt: str, project_dir: str) -> dict:
        """启动一个 Claude Code 实例执行任务"""

        # 读取 system prompt
        with open(self.prompt_file) as f:
            system_prompt = f.read()

        full_prompt = f"{system_prompt}\n\n---\n\n## 当前任务\n\n{task_prompt}"

        cmd = [
            "claude", "-p", full_prompt,
            "--output-format", "json",
            "--allowedTools", ",".join(self.allowed_tools)
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=project_dir,
            timeout=3600  # 最长 1 小时
        )

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
```

### 11.3 第三步：实现文件通信协议

```python
# comms/file_protocol.py
import os
import json
from datetime import datetime

class FileProtocol:
    def __init__(self, harness_dir: str):
        self.harness_dir = harness_dir
        self.specs_dir = os.path.join(harness_dir, "specs")
        self.reports_dir = os.path.join(harness_dir, "reports")
        self.contracts_dir = os.path.join(harness_dir, "specs", "sprint-contracts")

        for d in [self.specs_dir, self.reports_dir, self.contracts_dir]:
            os.makedirs(d, exist_ok=True)

    def write_spec(self, content: str):
        path = os.path.join(self.specs_dir, "feature-spec.md")
        with open(path, "w") as f:
            f.write(content)
        return path

    def read_spec(self) -> str:
        path = os.path.join(self.specs_dir, "feature-spec.md")
        with open(path) as f:
            return f.read()

    def write_contract(self, sprint_id: str, content: str):
        path = os.path.join(self.contracts_dir, f"{sprint_id}.md")
        with open(path, "w") as f:
            f.write(content)
        return path

    def read_contract(self, sprint_id: str) -> str:
        path = os.path.join(self.contracts_dir, f"{sprint_id}.md")
        with open(path) as f:
            return f.read()

    def write_eval_report(self, sprint_id: str, round_num: int, content: str):
        path = os.path.join(self.reports_dir, f"eval-{sprint_id}-round-{round_num}.md")
        with open(path, "w") as f:
            f.write(content)
        return path

    def read_eval_report(self, sprint_id: str, round_num: int) -> str:
        path = os.path.join(self.reports_dir, f"eval-{sprint_id}-round-{round_num}.md")
        if not os.path.exists(path):
            return ""
        with open(path) as f:
            return f.read()

    def log_decision(self, agent: str, context: str, options: list,
                     choice: str, reason: str, reversible: bool, needs_confirm: bool):
        log_path = os.path.join(self.harness_dir, "decisions.log")

        # 读取现有编号
        decision_num = 1
        if os.path.exists(log_path):
            with open(log_path) as f:
                content = f.read()
                decision_num = content.count("## Decision #") + 1

        entry = f"""
## Decision #{decision_num:03d}
- **时间**: {datetime.now().isoformat()}
- **Agent**: {agent}
- **上下文**: {context}
- **选项**: {' / '.join(options)}
- **选择**: {choice}
- **理由**: {reason}
- **可逆性**: {'高' if reversible else '低'}
- **需要用户确认**: {'是' if needs_confirm else '否'}
"""
        with open(log_path, "a") as f:
            f.write(entry)

    def get_state(self) -> dict:
        state_path = os.path.join(self.harness_dir, "state.json")
        if not os.path.exists(state_path):
            return {"current_state": "INIT", "current_round": 0}
        with open(state_path) as f:
            return json.load(f)

    def save_state(self, state: dict):
        state_path = os.path.join(self.harness_dir, "state.json")
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
```

### 11.4 第四步：实现编排引擎

```python
# orchestrator.py
from agents.planner import PlannerAgent
from agents.generator import GeneratorAgent
from agents.evaluator import EvaluatorAgent
from comms.file_protocol import FileProtocol
from comms.notifier import Notifier

class Orchestrator:
    def __init__(self, project_dir: str, config: dict):
        self.project_dir = project_dir
        self.config = config
        self.harness_dir = os.path.join(project_dir, ".harness")
        self.protocol = FileProtocol(self.harness_dir)
        self.notifier = Notifier(config.get("notifications", {}))

        self.planner = PlannerAgent()
        self.generator = GeneratorAgent()
        self.evaluator = EvaluatorAgent()

        self.max_rounds = config.get("max_rounds", 5)

    def run(self, user_prompt: str):
        state = self.protocol.get_state()

        # ========== Phase 1: Planning ==========
        self._update_state("PLANNING")
        print("🧠 [Planner] 生成功能规格...")

        spec_result = self.planner.run(
            task_prompt=f"用户需求: {user_prompt}\n\n请生成 Feature Spec。",
            project_dir=self.project_dir
        )
        self.protocol.write_spec(spec_result["stdout"])

        # 生成 Sprint Contract
        spec_content = self.protocol.read_spec()
        contract_result = self.planner.run(
            task_prompt=(
                f"以下是 Feature Spec:\n\n{spec_content}\n\n"
                f"请为第一个 Sprint 生成 Sprint Contract。"
            ),
            project_dir=self.project_dir
        )
        self.protocol.write_contract("sprint-001", contract_result["stdout"])

        self.notifier.send("📋 规划完成，开始实现...")

        # ========== Phase 2: Generate-Evaluate Loop ==========
        sprint_id = "sprint-001"
        contract_content = self.protocol.read_contract(sprint_id)

        for round_num in range(1, self.max_rounds + 1):
            # --- Generate ---
            self._update_state("GENERATING", round=round_num)
            print(f"⚙️ [Generator] 第 {round_num} 轮实现...")

            feedback = ""
            if round_num > 1:
                feedback = self.protocol.read_eval_report(sprint_id, round_num - 1)
                feedback = f"\n\n## 上一轮评估反馈\n\n{feedback}"

            self.generator.run(
                task_prompt=(
                    f"## Feature Spec\n\n{spec_content}\n\n"
                    f"## Sprint Contract\n\n{contract_content}"
                    f"{feedback}\n\n"
                    f"请按照 Contract 实现功能。完成后 git commit。"
                ),
                project_dir=self.project_dir
            )

            # --- Evaluate ---
            self._update_state("EVALUATING", round=round_num)
            print(f"🔍 [Evaluator] 第 {round_num} 轮评估...")

            eval_result = self.evaluator.run(
                task_prompt=(
                    f"## Sprint Contract\n\n{contract_content}\n\n"
                    f"请启动应用并按 Contract 逐项测试。"
                    f"第一行输出 PASS 或 FAIL。"
                ),
                project_dir=self.project_dir
            )
            self.protocol.write_eval_report(sprint_id, round_num, eval_result["stdout"])

            # 判断结果
            first_line = eval_result["stdout"].strip().split("\n")[0]
            if "PASS" in first_line.upper():
                print(f"✅ 第 {round_num} 轮评估通过！")
                break

            print(f"❌ 第 {round_num} 轮评估未通过")

            # 卡住检测
            if round_num >= 2:
                prev_report = self.protocol.read_eval_report(sprint_id, round_num - 1)
                if self._is_stuck(prev_report, eval_result["stdout"]):
                    self.notifier.send("⚠️ 检测到相同问题重复出现，请人工介入")
                    self._update_state("ESCALATED")
                    return

            if round_num >= self.max_rounds:
                self.notifier.send("⚠️ 达到最大重试次数，请人工介入")
                self._update_state("ESCALATED")
                return

        # ========== Phase 3: Review ==========
        self._update_state("REVIEWING")
        self._generate_summary()
        self.notifier.send("🎉 项目完成！请查看决策日志并验收。")
        self._update_state("DONE")

    def _update_state(self, new_state: str, **kwargs):
        state = self.protocol.get_state()
        state["current_state"] = new_state
        state.update(kwargs)
        self.protocol.save_state(state)

    def _is_stuck(self, prev_report: str, curr_report: str) -> bool:
        """检测是否连续两轮报告了相同的问题"""
        # 简单实现：比较 FAIL 条目是否相同
        prev_fails = set(self._extract_fails(prev_report))
        curr_fails = set(self._extract_fails(curr_report))
        overlap = prev_fails & curr_fails
        return len(overlap) > 0 and len(overlap) == len(curr_fails)

    def _extract_fails(self, report: str) -> list[str]:
        """从评估报告中提取失败条目"""
        fails = []
        for line in report.split("\n"):
            if "FAIL" in line and "|" in line:
                fails.append(line.strip())
        return fails

    def _generate_summary(self):
        """生成最终交付摘要"""
        # 读取决策日志，生成待审查列表
        pass
```

### 11.5 第五步：实现 CLI

```python
# cli.py
import click
import yaml
import os
from orchestrator import Orchestrator

@click.group()
def cli():
    """GanAI - 多 Agent 自主编程系统"""
    pass

@cli.command()
@click.argument("name")
def init(name):
    """初始化新项目"""
    project_dir = os.path.join(os.getcwd(), name)
    harness_dir = os.path.join(project_dir, ".harness")

    os.makedirs(harness_dir, exist_ok=True)
    os.makedirs(os.path.join(harness_dir, "specs", "sprint-contracts"), exist_ok=True)
    os.makedirs(os.path.join(harness_dir, "reports"), exist_ok=True)
    os.makedirs(os.path.join(harness_dir, "prompts"), exist_ok=True)

    # 初始化 git
    os.system(f"cd {project_dir} && git init")

    # 写入默认配置
    config = {
        "max_rounds": 5,
        "cost_budget_usd": 50,
        "notifications": {
            "enabled": False,
            "channel": "terminal"
        },
        "auto_approve_contract": True,
        "user_review_timeout_sec": 300
    }
    with open(os.path.join(harness_dir, "config.yaml"), "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    click.echo(f"✅ 项目 {name} 初始化完成")
    click.echo(f"   路径: {project_dir}")
    click.echo(f"   配置: {harness_dir}/config.yaml")
    click.echo(f"\n   运行: cd {name} && ganai run '你的需求描述'")

@cli.command()
@click.argument("prompt")
def run(prompt):
    """启动自主编程"""
    project_dir = os.getcwd()
    config_path = os.path.join(project_dir, ".harness", "config.yaml")

    if not os.path.exists(config_path):
        click.echo("❌ 当前目录不是 GanAI 项目。先运行 ganai init <name>")
        return

    with open(config_path) as f:
        config = yaml.safe_load(f)

    orchestrator = Orchestrator(project_dir, config)
    orchestrator.run(prompt)

@cli.command()
def status():
    """查看当前状态"""
    project_dir = os.getcwd()
    state_path = os.path.join(project_dir, ".harness", "state.json")

    if not os.path.exists(state_path):
        click.echo("当前无运行中的任务")
        return

    import json
    with open(state_path) as f:
        state = json.load(f)

    click.echo(f"状态: {state.get('current_state', 'UNKNOWN')}")
    click.echo(f"Sprint: {state.get('current_sprint', '-')}")
    click.echo(f"轮次: {state.get('current_round', 0)}")

@cli.command()
def decisions():
    """查看自治决策日志"""
    project_dir = os.getcwd()
    log_path = os.path.join(project_dir, ".harness", "decisions.log")

    if not os.path.exists(log_path):
        click.echo("暂无自治决策记录")
        return

    with open(log_path) as f:
        click.echo(f.read())

@cli.command()
def report():
    """查看最新评估报告"""
    project_dir = os.getcwd()
    reports_dir = os.path.join(project_dir, ".harness", "reports")

    if not os.path.exists(reports_dir):
        click.echo("暂无评估报告")
        return

    # 找到最新的评估报告
    reports = sorted([f for f in os.listdir(reports_dir) if f.startswith("eval-")])
    if not reports:
        click.echo("暂无评估报告")
        return

    latest = reports[-1]
    with open(os.path.join(reports_dir, latest)) as f:
        click.echo(f"📄 {latest}\n")
        click.echo(f.read())

if __name__ == "__main__":
    cli()
```

---

## 12. 风险与限制

### 12.1 已知风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Agent 幻觉导致错误架构决策 | Planner 输出的 Spec 偏离用户意图 | Sprint Contract 机制 + 用户确认关键决策 |
| Generator-Evaluator 死循环 | 成本失控，永远修不好 | 最大轮次限制 + 卡住检测 + 自动升级人工 |
| 上下文窗口耗尽 | Agent 遗忘前期设计意图 | 每个 Agent 独立上下文 + 文件系统持久化关键信息 |
| 成本超预期 | 大型项目成本难以预估 | 预算上限 + 实时成本监控 + 超预算自动暂停 |
| Evaluator 过于宽松 | 质量不达标就放过了 | Evaluator prompt 强调严格性 + 可配置评分阈值 |
| Evaluator 过于严格 | 永远 FAIL，进入死循环 | 卡住检测 + 区分 BLOCKER/MAJOR/MINOR 严重程度 |

### 12.2 当前限制

- **不适合大型企业应用**：系统适合 MVP 和中小型项目。超过 50 个页面的应用需要人工架构师深度参与。
- **无法处理外部依赖**：需要 API Key、第三方服务配置的场景需要用户提供。
- **单语言优化**：当前 prompt 针对 React + FastAPI + SQLite 技术栈优化。其他技术栈需要调整 prompt。
- **无增量迭代**：每次 run 是从头开始的全新项目，尚不支持"在现有项目上添加功能"。

### 12.3 演进路线

| 阶段 | 时间 | 目标 |
|------|------|------|
| v0.1 | 第 1-2 周 | CLI 可跑通完整流程，Planner → Generator → Evaluator 一轮循环 |
| v0.2 | 第 3-4 周 | 多轮对抗循环 + 卡住检测 + 决策日志 |
| v0.3 | 第 5-6 周 | 多 Sprint 支持 + 用户异步介入机制 |
| v0.5 | 第 2 月 | Web Dashboard + 通知系统 |
| v1.0 | 第 3 月 | 增量迭代 + 多技术栈支持 + 成本优化 |

---

> **文档状态**: Draft v0.1
> **下一步**: 根据反馈细化 Agent prompt 设计，开始 MVP 编码。

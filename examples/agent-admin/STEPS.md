# GanAI Example: Agent Admin Dashboard

本文档记录使用 GanAI 构建 AI Agent 后台管理系统的完整步骤。

---

## 📋 项目概述

| 项目 | 说明 |
|------|------|
| **名称** | Agent Admin Dashboard |
| **复杂度** | 中高（15个文件，2551行代码，35条验收标准）|
| **技术栈** | 纯 HTML + CSS + JavaScript（无构建工具）|
| **功能** | 完整 CRUD、SPA 路由、深色主题 Dashboard、Canvas 饼图、分页、搜索排序过滤 |

---

## 🚀 执行步骤

### Step 1: 初始化项目

```bash
mkdir example-agent-admin
cd example-agent-admin
ganai init agent-admin
```

输出：
```
✅ Initialized GanAI project "agent-admin" in example-agent-admin/.harness
   Edit .harness/config.yaml to customize settings.
```

创建了 `.harness/` 目录结构：
```
.harness/
├── config.yaml      # 预算、Agent 配置
├── specs/           # Planner 输出的 Feature Spec
├── contracts/       # Planner 输出的 Sprint Contract
└── reports/         # Evaluator 输出的评估报告
```

### Step 2: 配置预算

编辑 `.harness/config.yaml`：
```yaml
budget:
  maxCostUsd: 8.00    # 最大花费 8 美元
  maxRounds: 3          # 最多 3 轮 Generate↔Evaluate
  maxDurationMinutes: 60
```

### Step 3: 运行 GanAI

```bash
ganai run --headless --budget 8 --max-rounds 3 "构建一个 AI Agent 后台管理系统（Agent Admin Dashboard）..."
```

### Step 4: GanAI 自动编排三个 Agent

#### Phase 1: Planner Agent（📋 产品经理）— 2.5 分钟

Planner 分析需求后写了两个文件：

**Feature Spec** (`.harness/specs/sprint-XXX.md`)：
- 定义了 **35 条验收标准**（AC-1 到 AC-35）
- 覆盖：文件结构、Mock 数据、SPA 路由、侧边栏、Dashboard、Agent 列表、详情编辑、创建、UI 组件、视觉设计、数据完整性

**Sprint Contract** (`.harness/contracts/sprint-XXX.md`)：
- Generator 的具体实现指南
- Evaluator 的验证清单

#### Phase 2: Generator Agent（⚡ 全栈工程师）— 10 分钟

Generator 读取 Spec 和 Contract 后，创建了 **15 个文件**：

```
index.html                      # SPA 入口
css/
  style.css                     # 全局样式 + 深色主题变量（354行）
  dashboard.css                 # 仪表盘专用样式（154行）
  components.css                # 表格/表单/弹窗/Toast 样式（637行）
js/
  app.js                        # Hash 路由 + 初始化（55行）
  mock-data.js                  # 16个预设Agent + localStorage CRUD（207行）
  pages/
    dashboard.js                # Dashboard 统计 + 饼图 + 活动日志（95行）
    agent-list.js               # 表格 + 搜索 + 过滤 + 排序 + 分页（207行）
    agent-detail.js             # 详情/编辑 + 运行历史 + 删除（336行）
    agent-new.js                # 创建表单 + 验证（139行）
  components/
    sidebar.js                  # 折叠侧边栏 + 响应式汉堡菜单（99行）
    modal.js                    # 确认弹窗组件（45行）
    toast.js                    # Toast 提示组件（29行）
    chart.js                    # Canvas 饼图/甜甜圈图（79行）
    pagination.js               # 分页组件（76行）
```

#### Phase 3: Evaluator Agent（🔍 QA 工程师）— 2 分钟

Evaluator 逐一检查 35 条 AC：

```
✅ 35/35 通过
📊 得分：97/100
🏷  判定：PASS
```

改进建议：
1. 可以添加 error/info 类型的 toast 变体
2. 活动日志中 Agent 名称可以更突出
3. 可加入键盘无障碍支持（Escape 关闭弹窗等）

### Step 5: 查看结果

```bash
# 查看状态
ganai status

# 查看评估报告
ganai report
```

### Step 6: 打开项目

```bash
open index.html
```

---

## 📊 执行统计

| 指标 | 数值 |
|------|------|
| 总耗时 | ~14 分钟 (858秒) |
| 轮次 | 1 轮（一次通过）|
| 验收标准 | 35 条全部 PASS |
| 评分 | 97/100 |
| 生成文件 | 15 个 |
| 代码行数 | 2,551 行 |
| Planner 耗时 | ~2.5 分钟 |
| Generator 耗时 | ~10 分钟 |
| Evaluator 耗时 | ~2 分钟 |

---

## 🏗 生成的功能清单

- ✅ 深色主题 Dashboard（Vercel/Linear 风格）
- ✅ 4 张统计卡片（总数/运行中/已停止/总成本）
- ✅ Canvas 饼图（甜甜圈图 + 图例）
- ✅ 最近活动日志
- ✅ Agent 列表表格
- ✅ 按名称搜索
- ✅ 按状态筛选
- ✅ 点击表头排序（升序/降序切换）
- ✅ 分页（每页10条）
- ✅ Agent 详情/编辑页
- ✅ 表单验证（名称必填 + 唯一性检查）
- ✅ 删除确认弹窗
- ✅ Toast 成功提示
- ✅ SPA Hash 路由
- ✅ 侧边栏折叠/展开
- ✅ 响应式布局（移动端汉堡菜单）
- ✅ 页面切换淡入动画
- ✅ localStorage 数据持久化
- ✅ 16 个预设 Mock Agent（4种类型 × 3种状态）
- ✅ 每个 Agent 3-5 条运行历史

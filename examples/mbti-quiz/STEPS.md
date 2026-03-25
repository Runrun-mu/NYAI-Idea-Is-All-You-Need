# NYAI Example: MBTI Personality Quiz

This document records the steps used to build an MBTI personality quiz using NYAI.

## Prerequisites

- Bun 1.3+ installed
- Claude Code CLI 2.1.76+ installed and authenticated

## Step 1: Initialize the project

```bash
mkdir example-mbti
cd example-mbti
nyai init mbti-quiz
```

This creates `.harness/` directory with:
- `config.yaml` — budget, agent settings
- `specs/` — feature specs (written by Planner)
- `contracts/` — sprint contracts (written by Planner)
- `reports/` — evaluation reports (written by Evaluator)

## Step 2: Configure budget (optional)

Edit `.harness/config.yaml` to adjust budget:

```yaml
budget:
  maxCostUsd: 5.00
  maxRounds: 3
  maxDurationMinutes: 60
```

## Step 3: Run NYAI

### TUI Mode (interactive):
```bash
nyai run "构建一个MBTI性格测试问卷系统..."
```

### Headless Mode (CI/scripts):
```bash
nyai run --headless "构建一个MBTI性格测试问卷系统。要求：
1) 使用纯HTML+CSS+JavaScript实现（单个index.html文件即可），无需后端服务器。
2) 包含至少20道MBTI测试题目，涵盖E/I、S/N、T/F、J/P四个维度。
3) 每道题提供两个选项，用户点击选择后自动进入下一题。
4) 测试完成后根据用户选择计算MBTI类型（如INTJ、ENFP等16种之一）。
5) 展示结果页面，包含：用户的MBTI类型、各维度的倾向比例、该性格类型的详细描述。
6) 界面美观，使用现代CSS设计，支持移动端响应式布局。
7) 提供'重新测试'按钮可以重置并重新开始。"
```

## What happens during execution

NYAI orchestrates three AI agents in sequence:

### Phase 1: Planning (Planner Agent)
- Reads the user requirement
- Researches any existing code in the project
- Writes a **Feature Spec** with acceptance criteria (AC-1, AC-2, etc.)
- Writes a **Sprint Contract** for the Generator and Evaluator

### Phase 2: Generation (Generator Agent)
- Reads the Feature Spec and Sprint Contract
- Implements all acceptance criteria
- Writes the actual code files
- Self-reviews before finishing

### Phase 3: Evaluation (Evaluator Agent)
- Reads the Feature Spec
- Reviews all generated code
- Runs tests if available
- Checks each acceptance criterion
- Writes an evaluation report with PASS/FAIL/PARTIAL verdict

If the verdict is FAIL or PARTIAL, the loop repeats (Generator → Evaluator) with the evaluator's feedback, up to `maxRounds` times.

## Step 4: Check results

```bash
# View orchestrator status
nyai status

# View latest evaluation report
nyai report

# View autonomous decisions
nyai decisions
```

## Step 5: Open the result

Since this is a static HTML project:
```bash
open index.html
```

## Architecture Diagram

```
User Prompt
    │
    ▼
┌─────────┐    Feature Spec     ┌───────────┐
│ Planner  │ ──────────────────▶ │ .harness/ │
│ (PM/TL)  │    Sprint Contract  │  specs/   │
└─────────┘                     │  contracts/│
                                └─────┬─────┘
                                      │
                                      ▼
                    ┌──────────────────────────────┐
                    │         Generate ↔ Evaluate    │
                    │                                │
                    │  ┌───────────┐  ┌───────────┐ │
                    │  │ Generator │→→│ Evaluator  │ │
                    │  │ (Engineer)│  │ (QA)       │ │
                    │  └─────┬─────┘  └─────┬─────┘ │
                    │        │              │        │
                    │        │  FAIL? ◄─────┘        │
                    │        │  retry loop            │
                    │        ▼                        │
                    │   Code Files                    │
                    └──────────────────────────────┘
                                      │
                                      ▼ PASS
                                 ✅ Done!
```

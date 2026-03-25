import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import type { RegressionInfo } from '../types/protocol';
import { readFileSync } from 'fs';
import { join } from 'path';

const GENERATOR_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'generator.md');

export function buildGeneratorInvocation(
  config: NYAIConfig,
  sprintId: string,
  round: number,
  previousEvalFeedback?: string,
  previouslyPassedAcs?: string[],
  regressions?: RegressionInfo[]
): AgentInvocation {
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(
      config.agents.generator.systemPromptPath ?? GENERATOR_PROMPT_PATH,
      'utf-8'
    );
  } catch {
    systemPrompt = getDefaultGeneratorPrompt();
  }

  const harnessDir = join(config.project.rootDir, '.harness');
  const testFirst = config.testFirst !== false; // default true

  let prompt = `
## Sprint
- Sprint ID: ${sprintId}
- Round: ${round}
- Project root: ${config.project.rootDir}

## Instructions
1. Read the Feature Spec at: \`${harnessDir}/specs/${sprintId}.md\`
2. Read the Sprint Contract at: \`${harnessDir}/contracts/${sprintId}.md\`
3. Implement ALL acceptance criteria
4. Write clean, well-structured code
5. Include basic tests where appropriate
`.trim();

  // Test-first enforcement
  if (testFirst) {
    prompt += `

## ⚡ TEST-FIRST MODE (MANDATORY)
You MUST follow Test-Driven Development:
1. **FIRST**: Write failing tests for each acceptance criterion
2. **THEN**: Implement the code to make tests pass
3. **FINALLY**: Refactor while keeping tests green

For each AC, write the test BEFORE the implementation.
The Evaluator will verify that test files exist and are runnable.`;
  }

  // Regression protection
  if (previouslyPassedAcs && previouslyPassedAcs.length > 0) {
    prompt += `

## 🛡️ REGRESSION PROTECTION — DO NOT REGRESS
The following acceptance criteria have ALREADY PASSED in previous rounds:
${previouslyPassedAcs.map((ac) => `- ✅ ${ac}`).join('\n')}

**CRITICAL**: You MUST NOT break any of these. If your changes cause any of them to fail,
the Evaluator will flag it as a REGRESSION and you will need to fix it.
Do NOT delete or simplify existing functionality to fix new issues.`;
  }

  // Regression fix instructions
  if (regressions && regressions.length > 0) {
    prompt += `

## 🚨 REGRESSIONS DETECTED — FIX IMMEDIATELY
The following acceptance criteria REGRESSED (were passing, now failing):
${regressions.map((r) => `- 🔙 ${r.acId}: was PASS in round ${r.round}, now FAIL`).join('\n')}

**Priority 1**: Fix these regressions before working on anything else.
Do NOT delete tests or reduce test coverage to "fix" regressions.`;
  }

  if (round > 1 && previousEvalFeedback) {
    prompt += `

## ⚠️ Previous Evaluation Feedback (Round ${round - 1})
The Evaluator found issues in the previous round. Fix them:

${previousEvalFeedback}

Focus on fixing the FAILED acceptance criteria first.`;
  }

  return {
    role: 'generator',
    systemPrompt,
    userPrompt: prompt,
    allowedTools: config.agents.generator.allowedTools,
    disallowedTools: config.agents.generator.disallowedTools,
    maxTurns: config.agents.generator.maxTurns ?? 100,
    workingDir: config.project.rootDir,
    backend: config.agents.generator.backend ?? config.backend,
    model: config.agents.generator.model,
  };
}

function getDefaultGeneratorPrompt(): string {
  return `You are the Generator agent in NYAI — an autonomous AI development orchestrator.

Your role is a **Senior Full-Stack Engineer**. Given a Feature Spec and Sprint Contract, you:

1. **Read** the spec and contract carefully
2. **Implement** all acceptance criteria with clean, production-quality code
3. **Write tests** to verify your implementation
4. **Self-review** your code before finishing

## Rules
- Follow existing code conventions in the project
- Write comprehensive error handling
- Create meaningful commit-ready code (don't commit, just write files)
- If this is a fix round, focus on the failed acceptance criteria from evaluator feedback
- Use appropriate file structure and naming conventions
- NEVER delete existing passing tests or working functionality

## Important
- You have full tool access — use Write, Edit, Bash, etc. as needed
- Read existing code before writing to maintain consistency
- Run tests if a test framework is already configured`;
}

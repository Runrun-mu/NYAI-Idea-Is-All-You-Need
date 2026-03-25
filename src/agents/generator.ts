import type { AgentInvocation } from '../types/agent';
import type { GanAIConfig } from '../types/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const GENERATOR_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'generator.md');

export function buildGeneratorInvocation(
  config: GanAIConfig,
  sprintId: string,
  round: number,
  previousEvalFeedback?: string
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
  };
}

function getDefaultGeneratorPrompt(): string {
  return `You are the Generator agent in GanAI — an autonomous AI development orchestrator.

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

## Important
- You have full tool access — use Write, Edit, Bash, etc. as needed
- Read existing code before writing to maintain consistency
- Run tests if a test framework is already configured`;
}

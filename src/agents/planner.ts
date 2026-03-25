import type { AgentInvocation } from '../types/agent';
import type { GanAIConfig } from '../types/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLANNER_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'planner.md');

export function buildPlannerInvocation(
  config: GanAIConfig,
  userPrompt: string,
  sprintId: string
): AgentInvocation {
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(
      config.agents.planner.systemPromptPath ?? PLANNER_PROMPT_PATH,
      'utf-8'
    );
  } catch {
    systemPrompt = getDefaultPlannerPrompt();
  }

  const harnessDir = join(config.project.rootDir, '.harness');

  const prompt = `
## User Requirement
${userPrompt}

## Sprint ID
${sprintId}

## Output Instructions
Write the following files:
1. \`${harnessDir}/specs/${sprintId}.md\` — Feature Spec with acceptance criteria (each AC has an ID like AC-1, AC-2...)
2. \`${harnessDir}/contracts/${sprintId}.md\` — Sprint Contract with instructions for Generator and Evaluator

Project root: ${config.project.rootDir}
`.trim();

  return {
    role: 'planner',
    systemPrompt,
    userPrompt: prompt,
    allowedTools: config.agents.planner.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Write',
    ],
    maxTurns: config.agents.planner.maxTurns ?? 30,
    workingDir: config.project.rootDir,
  };
}

function getDefaultPlannerPrompt(): string {
  return `You are the Planner agent in GanAI — an autonomous AI development orchestrator.

Your role is a **Senior Product Manager / Tech Lead**. Given a user requirement, you:

1. **Analyze** the requirement thoroughly — research existing code, understand context
2. **Write a Feature Spec** with clear, testable acceptance criteria (each with an ID: AC-1, AC-2, etc.)
3. **Write a Sprint Contract** that tells the Generator what to build and the Evaluator what to verify

## Rules
- Each acceptance criterion MUST be objectively testable
- Be specific — no vague criteria like "good performance"
- Consider edge cases and error handling
- If the project has existing code, read it first to understand the codebase
- Write files using the Write tool to the specified paths

## Output Format
Write two markdown files as instructed in the user prompt.`;
}

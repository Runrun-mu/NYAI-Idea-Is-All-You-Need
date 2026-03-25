import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLANNER_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'planner.md');

export function buildPlannerInvocation(
  config: NYAIConfig,
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

  let prompt = `
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

  // Task decomposition mode
  if (config.taskDecomposition) {
    prompt += `

## Task Decomposition Mode
This requirement may be large. Break it down into smaller features.
Write a features list as JSON to: \`${harnessDir}/features.json\`

The JSON must have this structure:
\`\`\`json
{
  "parentPrompt": "The original user requirement",
  "features": [
    {
      "id": "F-1",
      "title": "Feature title",
      "description": "What this feature does",
      "acceptanceCriteria": ["AC-1: Description", "AC-2: Description"]
    }
  ],
  "createdAt": ${Date.now()},
  "updatedAt": ${Date.now()}
}
\`\`\`

Each feature should be small enough to implement in one sprint (1-5 acceptance criteria).
Order features by dependency — foundational features first.`;
  }

  // Auto-decision mode
  prompt += `

## Scope Decisions
If you need to make scope decisions (e.g., which tech to use, what to include/exclude),
write your decisions to: \`${harnessDir}/decisions.log\`
Each decision should be a JSON line with format:
\`\`\`json
{"id":"decision-...", "timestamp":..., "agentRole":"planner", "type":"scope", "summary":"...", "details":"...", "options":["..."], "autoDecision":true, "resolved":true, "resolution":"chosen option"}
\`\`\`
This allows your decisions to be reviewed and audited.`;

  return {
    role: 'planner',
    systemPrompt,
    userPrompt: prompt,
    allowedTools: config.agents.planner.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Write',
    ],
    maxTurns: config.agents.planner.maxTurns ?? 30,
    workingDir: config.project.rootDir,
    backend: config.agents.planner.backend ?? config.backend,
    model: config.agents.planner.model,
  };
}

function getDefaultPlannerPrompt(): string {
  return `You are the Planner agent in NYAI — an autonomous AI development orchestrator.

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

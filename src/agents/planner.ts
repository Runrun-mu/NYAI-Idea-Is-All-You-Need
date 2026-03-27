import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLANNER_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'planner.md');

export function buildPlannerInvocation(
  config: NYAIConfig,
  userPrompt: string,
  sprintId: string,
  memoryContext?: string
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
3. \`${harnessDir}/test-plans/${sprintId}.json\` — Test Plan (MANDATORY, see below)
4. \`${harnessDir}/critical-path/${sprintId}.json\` — Critical Path (MANDATORY, see below)

## Critical Path Output (MANDATORY — v0.6)
The Critical Path defines the **main user journey** — the primary happy-path scenario that must always work.
This is used for regression testing after each feature and for final goal acceptance.

Write it as JSON:
\`\`\`json
{
  "sprintId": "${sprintId}",
  "goalSummary": "One-line summary of what the user wants to achieve",
  "steps": [
    {
      "id": "CP-1",
      "description": "Open the application / navigate to main page",
      "verifyCommand": "curl -s http://localhost:3000 | grep -c '<title>'",
      "expectedOutput": "1",
      "dependsOn": []
    },
    {
      "id": "CP-2",
      "description": "Perform the core action",
      "verifyCommand": "curl -s http://localhost:3000/api/action | jq '.status'",
      "expectedOutput": "\"ok\"",
      "dependsOn": ["CP-1"]
    }
  ],
  "createdAt": ${Date.now()}
}
\`\`\`

### Critical Path Rules
- Focus on the **main happy path** only (3-8 steps max)
- Each step MUST have a \`verifyCommand\` that can be run in a shell
- Steps should verify the product works end-to-end, not individual units
- This is NOT a test plan — it's a smoke test for the overall product
- For CLI tools: use the tool's commands directly
- For web apps: use curl, wget, or similar
- For libraries: write a small script that imports and uses the library

## Test Plan Output (MANDATORY)
For **every** acceptance criterion, write 1-3 concrete, executable TestCases.
The Test Plan JSON must follow this structure:
\`\`\`json
{
  "sprintId": "${sprintId}",
  "testCases": [
    {
      "id": "TC-1",
      "acId": "AC-1",
      "title": "Short description of what is tested",
      "type": "unit | integration | e2e",
      "steps": [
        {
          "action": "What to do",
          "expected": "What should happen",
          "command": "curl -s localhost:3000/select | grep -c 'character-card'"
        }
      ],
      "expectedResult": "6",
      "automatable": true
    }
  ]
}
\`\`\`

### Test Plan Rules
- Each TestCase MUST reference an AC (via acId)
- Steps MUST include a \`command\` field with a runnable shell command whenever possible
- Be SPECIFIC and EXECUTABLE — the Evaluator will run these commands literally
- BAD example: \`"AC-3: 角色选择功能正常"\` (too vague, not machine-verifiable)
- GOOD example: \`"AC-3: GET /select returns 200, HTML body contains 6 elements with class='character-card'"\`
  → command: \`curl -s localhost:3000/select | grep -c 'character-card'\` expected: \`6\`
- For unit tests: command can be \`bun test <path>\` or \`npx vitest run <path>\`
- For e2e tests: command should use curl, grep, or similar CLI tools
- Set \`automatable: false\` ONLY for tests that genuinely require visual/manual verification

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

  // Memory context injection (always for planner)
  if (memoryContext) {
    prompt += `\n${memoryContext}`;
  }

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
4. **Write a Test Plan** with concrete, executable test cases for every AC

## Rules
- Each acceptance criterion MUST be objectively testable by a machine
- Be specific — no vague criteria like "good performance" or "works correctly"
- Each AC must have at least one TestCase with a runnable verification command
- Consider edge cases and error handling
- If the project has existing code, read it first to understand the codebase
- Write files using the Write tool to the specified paths

## Test Plan Quality
- BAD AC: "User login works" → not machine-verifiable
- GOOD AC: "POST /api/login with valid credentials returns 200 and a JSON body with 'token' field"
  → TC: curl -s -X POST localhost:3000/api/login -d '{"user":"test","pass":"test"}' | jq '.token' → non-empty string
- Every TestCase should have steps with concrete \`command\` fields that the Evaluator can run

## Output Format
Write three files as instructed in the user prompt: spec, contract, and test plan.`;
}

// ─── Replan Invocation (v0.2.1 — timeout simplification) ────────

export interface TimeoutHistory {
  retryCount: number;
  totalTimeSpentMs: number;
  timeoutReason?: string;
  filesModified: string[];
}

export function buildReplanInvocation(
  config: NYAIConfig,
  sprintId: string,
  featureTitle: string,
  timeoutHistory: TimeoutHistory,
  memoryContext?: string
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
## REPLANNING — Simplify Feature Due to Timeout

The Generator has been timing out repeatedly while working on this feature.
You must simplify the feature so it can be completed within the time budget.

### Original Feature
${featureTitle}

### Timeout History
- Times the Generator timed out: ${timeoutHistory.retryCount}
- Total time spent: ${Math.round(timeoutHistory.totalTimeSpentMs / 1000)}s
- Evaluator's assessment: ${timeoutHistory.timeoutReason ?? 'Task too complex for available time'}
- Files already modified: ${timeoutHistory.filesModified.length > 0 ? timeoutHistory.filesModified.join(', ') : '(none)'}

### Instructions
1. Read the existing spec at: \`${harnessDir}/specs/${sprintId}.md\`
2. Read the existing contract at: \`${harnessDir}/contracts/${sprintId}.md\`
3. **Simplify** the feature:
   - Remove non-critical acceptance criteria
   - Break complex criteria into smaller, achievable steps
   - Keep the core functionality, cut nice-to-haves
   - If files were already modified, preserve that progress
4. Write the **updated** spec and contract to the same paths:
   - \`${harnessDir}/specs/${sprintId}.md\`
   - \`${harnessDir}/contracts/${sprintId}.md\`

### Rules
- The simplified version MUST be achievable within ~${Math.round((config.budget.generatorTimeoutMs ?? 1_200_000) / 60000)} minutes
- Don't remove acceptance criteria that are already passing
- Clearly mark which criteria were removed or simplified
- Keep the sprint ID: ${sprintId}

Project root: ${config.project.rootDir}
`.trim();

  // Memory context injection
  if (memoryContext) {
    prompt += `\n${memoryContext}`;
  }

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

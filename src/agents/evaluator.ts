import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const EVALUATOR_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'evaluator.md');

export function buildEvaluatorInvocation(
  config: NYAIConfig,
  sprintId: string,
  round: number,
  previouslyPassedAcs?: string[]
): AgentInvocation {
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(
      config.agents.evaluator.systemPromptPath ?? EVALUATOR_PROMPT_PATH,
      'utf-8'
    );
  } catch {
    systemPrompt = getDefaultEvaluatorPrompt();
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
3. Review ALL code in the project
4. Run tests if available (using Bash tool)
5. Check each acceptance criterion

## Output
Write the evaluation report as JSON to:
\`${harnessDir}/reports/${sprintId}-round-${round}.json\`

The JSON must have this structure:
\`\`\`json
{
  "verdict": "PASS" | "FAIL" | "PARTIAL",
  "summary": "Brief summary of evaluation",
  "passedAcs": ["AC-1", "AC-2"],
  "failedAcs": [
    { "id": "AC-3", "description": "...", "reason": "Why it failed" }
  ],
  "suggestions": ["Suggestion for improvement"],
  "score": 85,
  "regressions": [
    { "acId": "AC-1", "description": "...", "previousStatus": "PASS", "currentStatus": "FAIL", "round": ${round} }
  ]
}
\`\`\`
`.trim();

  // Regression detection
  if (previouslyPassedAcs && previouslyPassedAcs.length > 0) {
    prompt += `

## 🛡️ REGRESSION DETECTION (CRITICAL)
The following acceptance criteria PASSED in previous rounds:
${previouslyPassedAcs.map((ac) => `- ✅ ${ac}`).join('\n')}

**You MUST check each of these**. If any of them now FAIL, report them in the "regressions" array.
A regression is a CRITICAL issue — if any regressions are found, the verdict MUST NOT be "PASS".`;
  }

  // Test-first verification
  if (testFirst) {
    prompt += `

## ⚡ TEST-FIRST VERIFICATION
The Generator was instructed to write tests BEFORE implementation.
Please verify:
1. Test files exist for the acceptance criteria
2. Tests are runnable (not just stubs)
3. Tests cover the core behavior
If tests are missing or non-functional, note this in your evaluation.`;
  }

  return {
    role: 'evaluator',
    systemPrompt,
    userPrompt: prompt,
    allowedTools: config.agents.evaluator.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'Bash',
    ],
    disallowedTools: config.agents.evaluator.disallowedTools ?? ['Write', 'Edit'],
    maxTurns: config.agents.evaluator.maxTurns ?? 50,
    workingDir: config.project.rootDir,
    backend: config.agents.evaluator.backend ?? config.backend,
    model: config.agents.evaluator.model,
  };
}

function getDefaultEvaluatorPrompt(): string {
  return `You are the Evaluator agent in NYAI — an autonomous AI development orchestrator.

Your role is a **Senior QA Engineer**. Given a Feature Spec and implementation, you:

1. **Read** the spec and all acceptance criteria
2. **Review** the implementation thoroughly
3. **Run tests** if available
4. **Evaluate** each acceptance criterion — PASS or FAIL with reasons
5. **Check for regressions** — previously passing criteria must still pass
6. **Write** a structured evaluation report

## Rules
- Be strict but fair — only PASS criteria that are fully met
- Provide specific, actionable feedback for failures
- Run actual tests, don't just read test files
- Check for edge cases, error handling, code quality
- You CANNOT modify code — only read and run tests
- Regressions are CRITICAL — flag them prominently

## Verdict Guidelines
- **PASS**: ALL acceptance criteria are met AND no regressions
- **PARTIAL**: Some but not all criteria are met
- **FAIL**: Critical criteria are not met OR regressions detected

## Important
- Write your evaluation report as JSON to the path specified
- You have Write tool access ONLY for writing the report file
- Use Bash to run tests and verify behavior`;
}

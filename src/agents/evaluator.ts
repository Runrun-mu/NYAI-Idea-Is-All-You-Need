import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import type { TimeoutContext, TestPlan, ArchitectureRecord } from '../types/protocol';
import { readFileSync } from 'fs';
import { join } from 'path';

const EVALUATOR_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'evaluator.md');

export function buildEvaluatorInvocation(
  config: NYAIConfig,
  sprintId: string,
  round: number,
  previouslyPassedAcs?: string[],
  timeoutContext?: TimeoutContext,
  memoryContext?: string,
  archRecord?: ArchitectureRecord | null,
  testPlan?: TestPlan | null
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

## Evaluation Protocol (3 Steps — MANDATORY)

You MUST follow all 3 steps in order. **Do NOT skip Step 1 or Step 2.**

### Step 1: Execute Automated Test Suite
${archRecord?.testInfra ? `
The architecture record specifies test infrastructure:
- Unit test command: \`${archRecord.testInfra.unitCommand ?? 'bun test'}\`
${archRecord.testInfra.e2eCommand ? `- E2E test command: \`${archRecord.testInfra.e2eCommand}\`` : ''}

**Run the unit test command using Bash.** Capture the full output.
If the command fails to start (missing runner), note this as a FAIL.
` : `
Try running \`bun test\` or \`npm test\` in the project root using Bash.
Capture the full output. If no test runner is configured, note this.
`}
Count: total tests, passed, failed, skipped.

### Step 2: Execute Test Plan Verification
${testPlan && testPlan.testCases.length > 0 ? `
A Test Plan exists at: \`${harnessDir}/test-plans/${sprintId}.json\`
Read it and execute EVERY test case where \`automatable: true\`.

For each automatable TestCase:
1. Run each step's \`command\` using Bash
2. Compare actual output with \`expected\`
3. Record PASS/FAIL/SKIP/ERROR for each test case

Test cases to verify:
${testPlan.testCases.map((tc) => `- ${tc.id} (${tc.acId}): ${tc.title} — ${tc.automatable ? 'RUN' : 'MANUAL ONLY'}`).join('\n')}
` : `
No Test Plan found at \`${harnessDir}/test-plans/${sprintId}.json\`.
Note this in your report. Check if there are any test files in the project and run them.
`}

### Step 3: Supplementary Code Review
- Read the Feature Spec at: \`${harnessDir}/specs/${sprintId}.md\`
- Read the Sprint Contract at: \`${harnessDir}/contracts/${sprintId}.md\`
- Review code quality, error handling, edge cases
- This step is SUPPLEMENTARY — it cannot override Step 1 & 2 results

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
  "testResults": {
    "ran": true,
    "total": 10,
    "passed": 8,
    "failed": 2,
    "skipped": 0,
    "details": [
      { "testCaseId": "TC-1", "acId": "AC-1", "status": "PASS", "output": "..." }
    ],
    "rawOutput": "Full test runner output here"
  },
  "regressions": [
    { "acId": "AC-1", "description": "...", "previousStatus": "PASS", "currentStatus": "FAIL", "round": ${round} }
  ]
}
\`\`\`

## Verdict Rules (STRICT)
- **Tests exist AND any test FAILS → verdict MUST NOT be "PASS"**
- **Test plan commands executed AND any fails → verdict MUST NOT be "PASS"**
- Tests not run at all → you MUST attempt to run them; if truly impossible, note why
- **Principle: untested ≠ passed. A test that wasn't run does NOT count as passing.**
- PASS = ALL ACs verified by actual test execution + no regressions
- PARTIAL = some ACs verified, some not
- FAIL = critical ACs failing OR regressions detected
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

  // Test-first verification (enhanced in v0.5)
  if (testFirst) {
    prompt += `

## ⚡ TEST-FIRST VERIFICATION
The Generator was instructed to write tests BEFORE implementation.
Please verify:
1. Test files exist for the acceptance criteria
2. Tests are runnable (not just stubs)
3. Tests cover the core behavior
4. Tests actually EXECUTE and produce results (run them!)
If tests are missing or non-functional, this is a significant issue — note it prominently.`;
  }

  // Timeout evaluation — Evaluator decides whether to continue, abort, or simplify
  if (timeoutContext) {
    // For timeout evaluation, the evaluator needs Write access to write the report
    prompt += `

## ⏰ TIMEOUT EVALUATION (CRITICAL)
The Generator was terminated due to timeout. You must assess the progress and decide what to do next.

**Timeout Details:**
- Round: ${timeoutContext.round}
- Duration before timeout: ${Math.round(timeoutContext.durationMs / 1000)}s
- Retry count: ${timeoutContext.retryCount}
- Total time spent on this task: ${Math.round(timeoutContext.totalTimeSpentMs / 1000)}s
- Files modified: ${timeoutContext.filesModified.length > 0 ? timeoutContext.filesModified.join(', ') : '(none)'}

**Partial output (last 2000 chars):**
\`\`\`
${timeoutContext.partialOutput.slice(-2000)}
\`\`\`

**Your evaluation report MUST include these additional fields:**
\`\`\`json
{
  "timeoutRecommendation": "continue" | "abort" | "simplify",
  "estimatedAdditionalTimeMs": 600000,
  "timeoutReason": "Brief explanation of your assessment"
}
\`\`\`

**Decision guidelines:**
- **"continue"**: Generator made clear progress (modified relevant files, partial implementation visible). Estimate how much MORE time is needed via \`estimatedAdditionalTimeMs\`.
- **"abort"**: No meaningful progress, or same timeout pattern repeated without improvement. Treat as a failure.
- **"simplify"**: The task appears too complex for the Generator. Recommend breaking it down or simplifying scope.

Still check any acceptance criteria that may have been partially completed.`;
  }

  // Memory context injection (round 1 only)
  if (round === 1 && memoryContext) {
    prompt += `\n${memoryContext}`;
  }

  return {
    role: 'evaluator',
    systemPrompt,
    userPrompt: prompt,
    allowedTools: config.agents.evaluator.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'Bash', 'Write',
    ],
    disallowedTools: config.agents.evaluator.disallowedTools ?? ['Edit'],
    maxTurns: config.agents.evaluator.maxTurns ?? 50,
    workingDir: config.project.rootDir,
    backend: config.agents.evaluator.backend ?? config.backend,
    model: config.agents.evaluator.model,
  };
}

function getDefaultEvaluatorPrompt(): string {
  return `You are the Evaluator agent in NYAI — an autonomous AI development orchestrator.

Your role is a **Senior QA Engineer**. Given a Feature Spec and implementation, you:

1. **Run automated tests** — execute the test suite using the configured test runner (Step 1)
2. **Execute Test Plan** — run each automatable test case from the test plan (Step 2)
3. **Supplementary code review** — review code quality, edge cases, error handling (Step 3)
4. **Evaluate** each acceptance criterion based on ACTUAL test results
5. **Check for regressions** — previously passing criteria must still pass
6. **Write** a structured evaluation report with testResults

## Rules
- **TEST EXECUTION IS MANDATORY** — you MUST run tests, not just read them
- Be strict but fair — only PASS criteria verified by actual test execution
- Provide specific, actionable feedback for failures
- Include the \`testResults\` field in your report with actual execution data
- A test that wasn't run does NOT count as passing
- You CANNOT modify application code — only read code, run tests, and write the report
- Regressions are CRITICAL — flag them prominently
- You have Write tool access ONLY for writing the evaluation report file

## Verdict Guidelines
- **PASS**: ALL acceptance criteria verified by tests AND no regressions AND no test failures
- **PARTIAL**: Some but not all criteria verified by tests
- **FAIL**: Critical criteria not verified OR test failures OR regressions detected

## Important
- Write your evaluation report as JSON to the path specified
- Use Bash to run ALL tests — do not just read test files
- Include raw test output in the testResults.rawOutput field`;
}

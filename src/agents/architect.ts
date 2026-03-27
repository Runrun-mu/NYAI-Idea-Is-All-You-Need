import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const ARCHITECT_PROMPT_PATH = join(import.meta.dir, '..', 'prompts', 'architect.md');

export function buildArchitectInvocation(
  config: NYAIConfig,
  userPrompt: string,
  sprintId: string
): AgentInvocation {
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(
      config.agents.architect?.systemPromptPath ?? ARCHITECT_PROMPT_PATH,
      'utf-8'
    );
  } catch {
    systemPrompt = getDefaultArchitectPrompt();
  }

  const harnessDir = join(config.project.rootDir, '.harness');

  const prompt = `
## User Requirement
${userPrompt}

## Sprint ID
${sprintId}

## Output Instructions
1. Analyze the project at: ${config.project.rootDir}
2. Determine the technology stack and architecture
3. Create scaffolding if this is a new project
4. **Set up test infrastructure** (MANDATORY):
   - Install a test runner: use \`vitest\` for web/Node projects, or \`bun test\` for Bun projects
   - Add a \`"test"\` script in \`package.json\` (e.g., \`"test": "vitest run"\` or \`"test": "bun test"\`)
   - For web projects: create a basic e2e test script at \`scripts/e2e-test.sh\` that starts the dev server, runs curl assertions, and shuts down the server
   - Verify the test runner starts successfully (\`bun test\` or \`npm test\` should exit 0 with no tests or pass)
5. Write the architecture record as JSON to:
   \`${harnessDir}/architecture.json\`

   The architecture record MUST include a \`testInfra\` field:
   \`\`\`json
   {
     "testInfra": {
       "unitRunner": "vitest",
       "unitCommand": "npx vitest run",
       "e2eCommand": "bash scripts/e2e-test.sh",
       "devServerCommand": "bun run dev",
       "devServerPort": 3000
     }
   }
   \`\`\`
   Adjust values based on the actual tech stack chosen.

Project root: ${config.project.rootDir}
`.trim();

  const architectConfig = config.agents.architect ?? {};

  return {
    role: 'architect',
    systemPrompt,
    userPrompt: prompt,
    allowedTools: architectConfig.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit',
    ],
    maxTurns: architectConfig.maxTurns ?? 30,
    workingDir: config.project.rootDir,
    backend: architectConfig.backend ?? config.backend,
    model: architectConfig.model,
  };
}

function getDefaultArchitectPrompt(): string {
  return `You are the Architect agent in NYAI — an autonomous AI development orchestrator.

Your role is a **Senior Software Architect**. Given a user requirement, you:

1. **Analyze** the existing project (if any) — read code, understand stack
2. **Decide** on the technology stack and architecture
3. **Scaffold** the project if needed (directory structure, configs, etc.)
4. **Set up test infrastructure** (MANDATORY):
   - Install a test runner appropriate for the stack (vitest for web/Node, bun test for Bun)
   - Configure \`package.json\` with a working \`"test"\` script
   - For web projects, create \`scripts/e2e-test.sh\` that starts dev server → curl assertions → shutdown
   - Verify the test runner can be invoked without errors
5. **Verify** the scaffolding builds/compiles and tests can run
6. **Document** your decisions in an architecture record

## Rules
- Respect existing code and architecture
- Choose practical, well-supported technologies
- Verify scaffolding works before finishing
- Write the architecture record as JSON to the specified path
- The architecture record MUST include a \`testInfra\` field with: unitRunner, unitCommand, e2eCommand (if applicable), devServerCommand (if applicable), devServerPort (if applicable)

## Output
Write architecture record JSON to the path specified in the user prompt.`;
}

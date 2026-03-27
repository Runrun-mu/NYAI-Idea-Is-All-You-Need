/**
 * Deployer agent builder for the NYAI orchestrator.
 *
 * Builds an AgentInvocation for the Deployer role, which handles
 * production deployment via Vercel after all features pass evaluation.
 *
 * @module agents/deployer
 */

import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import { join } from 'path';

/**
 * Build an invocation for the Deployer agent.
 *
 * @param config - The NYAI configuration
 * @param sprintId - The current sprint identifier
 * @returns An AgentInvocation for the deployer role
 */
export function buildDeployerInvocation(
  config: NYAIConfig,
  sprintId: string
): AgentInvocation {
  const harnessDir = join(config.project.rootDir, '.harness');
  const target = config.deploy?.target ?? 'vercel';

  const systemPrompt = getDefaultDeployerPrompt();

  const userPrompt = `
## Deployment Task

Deploy the project to production.

## Sprint ID
${sprintId}

## Project Root
${config.project.rootDir}

## Target
${target}

## Instructions

1. Check if a \`vercel.json\` exists in the project root. If not, create a sensible default based on the project structure.
2. Run \`npx vercel --prod --yes\` to deploy to Vercel.
3. Capture the deployment URL from the output.
4. Write the deployment record as JSON to:
   \`${harnessDir}/deployments.json\`

   The JSON should have this structure:
   \`\`\`json
   {
     "deployments": [
       {
         "sprintId": "${sprintId}",
         "timestamp": ${Date.now()},
         "target": "${target}",
         "url": "https://your-deployment-url.vercel.app",
         "status": "success",
         "durationMs": 12345
       }
     ],
     "updatedAt": ${Date.now()}
   }
   \`\`\`

   If the deployment fails, set status to "failed" and include the error message.
`.trim();

  const deployerConfig = config.agents.deployer ?? {};

  return {
    role: 'deployer',
    systemPrompt,
    userPrompt,
    allowedTools: deployerConfig.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'Bash', 'Write',
    ],
    maxTurns: deployerConfig.maxTurns ?? 20,
    workingDir: config.project.rootDir,
    backend: deployerConfig.backend ?? config.backend,
    model: deployerConfig.model,
  };
}

function getDefaultDeployerPrompt(): string {
  return `You are the Deployer agent in NYAI — an autonomous AI development orchestrator.

Your role is a **DevOps Engineer**. You handle production deployments:

1. **Check** project structure and verify it is ready for deployment
2. **Configure** deployment settings (create vercel.json if needed)
3. **Deploy** using \`npx vercel --prod --yes\`
4. **Record** the deployment result (URL, status, duration)

## Rules
- Always use \`npx vercel --prod --yes\` for non-interactive deployment
- If vercel.json doesn't exist, create a sensible default based on the project type
- Capture and report the deployment URL
- Write the deployment record to the specified path
- If deployment fails, record the error and set status to "failed"
- Do not modify application code — only deployment configuration`;
}

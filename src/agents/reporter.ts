/**
 * Reporter agent builder for the NYAI orchestrator.
 *
 * Builds an AgentInvocation for the Reporter role, which generates
 * self-contained HTML progress reports at key milestones.
 *
 * @module agents/reporter
 */

import type { AgentInvocation } from '../types/agent';
import type { NYAIConfig } from '../types/config';
import { join } from 'path';

/**
 * Build an invocation for the Reporter agent.
 *
 * @param config - The NYAI configuration
 * @param sprintId - The current sprint identifier
 * @returns An AgentInvocation for the reporter role
 */
export function buildReporterInvocation(
  config: NYAIConfig,
  sprintId: string
): AgentInvocation {
  const harnessDir = join(config.project.rootDir, '.harness');
  const timestamp = Date.now();
  const reportPath = join(harnessDir, 'reports', `progress-${timestamp}.html`);

  const systemPrompt = getDefaultReporterPrompt();

  const userPrompt = `
## Report Generation Task

Generate an HTML progress report for the current sprint.

## Sprint ID
${sprintId}

## Project
Name: ${config.project.name}
Root: ${config.project.rootDir}

## Harness Directory
${harnessDir}

## Output Path
${reportPath}

## Instructions

1. Read \`${harnessDir}/state.json\` to get the current orchestrator state (round, cost, duration, verdict, etc.)
2. Read \`${harnessDir}/features.json\` to get the feature list and their statuses (done, in_progress, pending)
3. Read any evaluation report files in \`${harnessDir}/reports/\` for the latest results
4. Read \`${harnessDir}/progress.log\` for a timeline of agent activities
5. Generate a **self-contained** HTML file (all CSS inline, no external dependencies) and write it to:
   \`${reportPath}\`

The HTML report should be a visual dashboard containing:
- **Header**: Project name ("${config.project.name}") and current state/status
- **Feature Progress**: X/Y completed, with a list showing each feature's status
- **Timeline**: A chronological list of key agent activities (agent starts, completions, verdicts)
- **Stats**: Total rounds, total cost (USD), total duration
- **Evaluation Results**: Latest verdict, passed/failed acceptance criteria

Make the report visually appealing with a clean, modern design. Use a dark theme with accent colors.
`.trim();

  const reporterConfig = config.agents.reporter ?? {};

  return {
    role: 'reporter',
    systemPrompt,
    userPrompt,
    allowedTools: reporterConfig.allowedTools ?? [
      'Read', 'Glob', 'Grep', 'Write',
    ],
    maxTurns: reporterConfig.maxTurns ?? 10,
    workingDir: config.project.rootDir,
    backend: reporterConfig.backend ?? config.backend,
    model: reporterConfig.model,
  };
}

function getDefaultReporterPrompt(): string {
  return `You are the Reporter agent in NYAI — an autonomous AI development orchestrator.

Your role is a **Technical Writer / Dashboard Builder**. You generate self-contained HTML progress reports:

1. **Read** the .harness/ directory to gather current state, feature list, evaluation results, and progress logs
2. **Analyze** the data to produce a clear summary of progress
3. **Generate** a beautiful, self-contained HTML report with inline CSS (no external dependencies)
4. **Write** the HTML file to the specified output path

## Rules
- The HTML must be fully self-contained — inline all CSS, no external stylesheets or scripts
- Use a clean, modern dark-themed design
- Include all sections: header, feature progress, timeline, stats, evaluation results
- If data files are missing, note "No data available" for that section
- Do not modify any project files — only read .harness/ files and write the report
- Keep the report concise but informative
- Ensure the reports/ directory exists before writing (create it if needed)`;
}

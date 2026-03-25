import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeBannerProps {
  prompt: string;
  projectName?: string;
  budget?: number;
  maxRounds?: number;
}

export function WelcomeBanner({ prompt, projectName, budget, maxRounds }: WelcomeBannerProps) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        ╔═══════════════════════════════════════╗
      </Text>
      <Text bold color="cyan">
        ║          🤖 GanAI Orchestrator        ║
      </Text>
      <Text bold color="cyan">
        ╚═══════════════════════════════════════╝
      </Text>
      <Text> </Text>
      {projectName && (
        <Text>
          <Text bold color="blue">Project: </Text>
          <Text>{projectName}</Text>
        </Text>
      )}
      <Text>
        <Text bold color="blue">Prompt: </Text>
        <Text>{prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt}</Text>
      </Text>
      {budget !== undefined && (
        <Text>
          <Text bold color="blue">Budget: </Text>
          <Text>${budget.toFixed(2)} | Max {maxRounds} rounds</Text>
        </Text>
      )}
      <Text> </Text>
    </Box>
  );
}

import React from 'react';
import { Box, Text } from 'ink';
import type { AgentRole } from '../../types/agent';
import type { AgentStatus } from '../hooks/useOrchestrator';

interface AgentPanelProps {
  agentStatuses: Record<AgentRole, AgentStatus>;
  currentAgent: AgentRole | null;
}

const AGENT_LABELS: Record<AgentRole, { emoji: string; name: string }> = {
  architect: { emoji: '🏗️', name: 'Architect' },
  planner: { emoji: '📋', name: 'Planner' },
  generator: { emoji: '⚡', name: 'Generator' },
  evaluator: { emoji: '🔍', name: 'Evaluator' },
  deployer: { emoji: '🚀', name: 'Deployer' },
  reporter: { emoji: '📊', name: 'Reporter' },
};

export function AgentPanel({ agentStatuses, currentAgent }: AgentPanelProps) {
  const roles: AgentRole[] = ['architect', 'planner', 'generator', 'evaluator', 'deployer', 'reporter'];

  return (
    <Box flexDirection="column" width={28} borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        {' '}Agents{' '}
      </Text>
      <Text> </Text>
      {roles.map((role) => {
        const status = agentStatuses[role];
        const label = AGENT_LABELS[role];
        const isActive = currentAgent === role;

        return (
          <Box key={role} flexDirection="column" marginBottom={1}>
            <Text>
              {getStatusIcon(status.status)}{' '}
              <Text bold color={isActive ? 'yellow' : 'white'}>
                {label.emoji} {label.name}
              </Text>
            </Text>
            <Text color="gray">
              {'  '}{getStatusText(status)}
            </Text>
            {status.lastResult && (
              <Text color="gray">
                {'  '}💰 ${status.lastResult.costUsd.toFixed(4)} | 🔄 {status.lastResult.numTurns} turns
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function getStatusIcon(status: AgentStatus['status']): string {
  switch (status) {
    case 'idle': return '⏳';
    case 'running': return '🔄';
    case 'done': return '✅';
    case 'error': return '❌';
  }
}

function getStatusText(status: AgentStatus): string {
  switch (status.status) {
    case 'idle': return 'Waiting...';
    case 'running': return 'Running...';
    case 'done': return 'Completed';
    case 'error': return status.lastResult?.error?.slice(0, 40) ?? 'Error';
  }
}

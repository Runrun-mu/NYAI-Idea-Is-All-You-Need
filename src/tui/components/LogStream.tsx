import React from 'react';
import { Box, Text } from 'ink';
import type { LogLine } from '../hooks/useOrchestrator';

interface LogStreamProps {
  logs: LogLine[];
  height?: number;
}

const ROLE_COLORS: Record<string, string> = {
  planner: 'blue',
  generator: 'green',
  evaluator: 'yellow',
};

export function LogStream({ logs, height = 20 }: LogStreamProps) {
  const visibleLogs = logs.slice(-height);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      height={height + 2}
    >
      <Text bold color="gray">
        {' '}Logs{' '}
      </Text>
      {visibleLogs.length === 0 ? (
        <Text color="gray" dimColor>
          Waiting for agent output...
        </Text>
      ) : (
        visibleLogs.map((log, i) => (
          <Text key={i} wrap="truncate">
            <Text color={ROLE_COLORS[log.role] ?? 'white'} bold>
              [{log.role}]
            </Text>{' '}
            <Text>{log.line}</Text>
          </Text>
        ))
      )}
    </Box>
  );
}

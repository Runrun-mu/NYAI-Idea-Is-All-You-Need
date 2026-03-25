import React from 'react';
import { Box, Text } from 'ink';
import type { State } from '../../types/state';
import type { EvalVerdict } from '../../types/protocol';

interface StatusBarProps {
  state: State;
  sprintId: string;
  round: number;
  costSpent: number;
  costBudget: number;
  elapsed: string;
  lastVerdict: EvalVerdict | null;
  error: string | null;
}

export function StatusBar({
  state,
  sprintId,
  round,
  costSpent,
  costBudget,
  elapsed,
  lastVerdict,
  error,
}: StatusBarProps) {
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={2}>
        <Text>
          <Text bold color="blue">State:</Text>{' '}
          <Text color={getStateColor(state)}>{state}</Text>
        </Text>
        <Text>
          <Text bold color="blue">Round:</Text> {round}
        </Text>
        {lastVerdict && (
          <Text>
            <Text bold color="blue">Verdict:</Text>{' '}
            <Text color={getVerdictColor(lastVerdict)}>{lastVerdict}</Text>
          </Text>
        )}
      </Box>
      <Box gap={2}>
        <Text>
          <Text bold color="blue">Cost:</Text>{' '}
          ${costSpent.toFixed(4)} / ${costBudget.toFixed(2)}
        </Text>
        <Text>
          <Text bold color="blue">Time:</Text> {elapsed}
        </Text>
      </Box>
      {error ? (
        <Text color="red" bold>⚠ {error.slice(0, 50)}</Text>
      ) : (
        <Text color="gray" dimColor>
          D:decisions R:report S:spec L:logs Q:quit
        </Text>
      )}
    </Box>
  );
}

function getStateColor(state: State): string {
  switch (state) {
    case 'IDLE': return 'gray';
    case 'PLANNING': case 'CONTRACTING': return 'blue';
    case 'GENERATING': return 'green';
    case 'EVALUATING': return 'yellow';
    case 'BLOCKED': return 'red';
    case 'DONE': return 'green';
    case 'ERROR': return 'red';
    default: return 'white';
  }
}

function getVerdictColor(verdict: EvalVerdict): string {
  switch (verdict) {
    case 'PASS': return 'green';
    case 'PARTIAL': return 'yellow';
    case 'FAIL': return 'red';
  }
}

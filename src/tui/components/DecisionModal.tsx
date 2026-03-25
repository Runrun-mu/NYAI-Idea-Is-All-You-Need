import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PendingDecision } from '../../types/state';

interface DecisionModalProps {
  decision: PendingDecision;
  onResolve: (resolution: string) => void;
}

export function DecisionModal({ decision, onResolve }: DecisionModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const options = decision.options;

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : options.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      onResolve(options[selectedIndex]);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      marginX={4}
      marginY={2}
    >
      <Text bold color="yellow">
        ⚠️  Decision Required
      </Text>
      <Text> </Text>
      <Text bold>{decision.summary}</Text>
      <Text color="gray">{decision.details}</Text>
      <Text> </Text>
      {options.map((option, i) => (
        <Text key={i}>
          {i === selectedIndex ? (
            <Text color="yellow" bold>{'❯ '}{option}</Text>
          ) : (
            <Text color="gray">{'  '}{option}</Text>
          )}
        </Text>
      ))}
      <Text> </Text>
      <Text color="gray" dimColor>
        ↑↓ Navigate  ↵ Select
      </Text>
    </Box>
  );
}

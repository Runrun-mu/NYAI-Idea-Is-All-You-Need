import React from 'react';
import { Box, Text } from 'ink';

interface SpecViewProps {
  specContent: string;
  onClose: () => void;
}

export function SpecView({ specContent, onClose }: SpecViewProps) {
  // Show first ~40 lines to fit in terminal
  const lines = specContent.split('\n').slice(0, 40);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
      <Text bold color="green">
        📄 Feature Spec
      </Text>
      <Text> </Text>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {specContent.split('\n').length > 40 && (
        <Text color="gray" dimColor>... (truncated)</Text>
      )}
      <Text> </Text>
      <Text color="gray" dimColor>Press any key to close</Text>
    </Box>
  );
}

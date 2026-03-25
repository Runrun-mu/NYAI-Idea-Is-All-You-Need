import React from 'react';
import { Box, Text } from 'ink';
import type { EvalReport } from '../../types/protocol';

interface ReportViewProps {
  report: EvalReport;
  onClose: () => void;
}

export function ReportView({ report, onClose }: ReportViewProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text bold color="yellow">
        📊 Evaluation Report — Round {report.round}
      </Text>
      <Text> </Text>
      <Text>
        <Text bold>Verdict: </Text>
        <Text color={report.verdict === 'PASS' ? 'green' : report.verdict === 'PARTIAL' ? 'yellow' : 'red'} bold>
          {report.verdict}
        </Text>
        {report.score !== undefined && <Text color="gray"> (Score: {report.score})</Text>}
      </Text>
      <Text> </Text>
      <Text bold>Summary:</Text>
      <Text>{report.summary}</Text>
      <Text> </Text>

      {report.passedAcs.length > 0 && (
        <>
          <Text bold color="green">✅ Passed ({report.passedAcs.length}):</Text>
          {report.passedAcs.map((ac) => (
            <Text key={ac} color="green">  • {ac}</Text>
          ))}
          <Text> </Text>
        </>
      )}

      {report.failedAcs.length > 0 && (
        <>
          <Text bold color="red">❌ Failed ({report.failedAcs.length}):</Text>
          {report.failedAcs.map((ac) => (
            <Text key={ac.id} color="red">
              {'  '}• {ac.id}: {ac.reason}
            </Text>
          ))}
          <Text> </Text>
        </>
      )}

      {report.suggestions.length > 0 && (
        <>
          <Text bold color="blue">💡 Suggestions:</Text>
          {report.suggestions.map((s, i) => (
            <Text key={i} color="blue">  • {s}</Text>
          ))}
          <Text> </Text>
        </>
      )}

      <Text color="gray" dimColor>Press any key to close</Text>
    </Box>
  );
}

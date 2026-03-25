import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { Orchestrator } from '../core/orchestrator';
import type { NYAIConfig } from '../types/config';
import { useOrchestrator } from './hooks/useOrchestrator';
import { useKeyboard } from './hooks/useKeyboard';
import { useTimer } from './hooks/useTimer';
import { Layout } from './components/Layout';
import { AgentPanel } from './components/AgentPanel';
import { LogStream } from './components/LogStream';
import { StatusBar } from './components/StatusBar';
import { DecisionModal } from './components/DecisionModal';
import { ReportView } from './components/ReportView';
import { SpecView } from './components/SpecView';
import { WelcomeBanner } from './components/WelcomeBanner';
import { readSpec } from '../protocol/file-protocol';

type OverlayView = 'none' | 'report' | 'spec';

interface AppProps {
  orchestrator: Orchestrator;
  config: NYAIConfig;
  prompt: string;
}

export function App({ orchestrator, config, prompt }: AppProps) {
  const { exit } = useApp();
  const uiState = useOrchestrator(orchestrator);
  const elapsed = useTimer(!uiState.done);
  const [overlay, setOverlay] = useState<OverlayView>('none');

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'report':
          setOverlay((prev) => (prev === 'report' ? 'none' : 'report'));
          break;
        case 'spec':
          setOverlay((prev) => (prev === 'spec' ? 'none' : 'spec'));
          break;
        case 'quit':
          exit();
          break;
        case 'decisions':
        case 'log-level':
          // Toggle or cycle — simplified for now
          break;
      }
    },
    [exit]
  );

  // Close overlay on any key
  useInput(() => {
    if (overlay !== 'none') {
      setOverlay('none');
    }
  });

  useKeyboard({
    onAction: handleAction,
    onAbort: () => {
      orchestrator.abort();
      exit();
    },
    enabled: overlay === 'none' && !uiState.pendingDecision,
  });

  // Render overlay views
  if (overlay === 'report' && uiState.lastReport) {
    return (
      <ReportView
        report={uiState.lastReport}
        onClose={() => setOverlay('none')}
      />
    );
  }

  if (overlay === 'spec') {
    const specContent = readSpec(
      orchestrator.getHarnessDir(),
      uiState.sprintId
    );
    if (specContent) {
      return (
        <SpecView
          specContent={specContent}
          onClose={() => setOverlay('none')}
        />
      );
    }
  }

  return (
    <Layout
      header={
        <WelcomeBanner
          prompt={prompt}
          projectName={config.project.name}
          budget={config.budget.maxCostUsd}
          maxRounds={config.budget.maxRounds}
        />
      }
      left={
        <AgentPanel
          agentStatuses={uiState.agentStatuses}
          currentAgent={uiState.currentAgent}
        />
      }
      right={<LogStream logs={uiState.logs} />}
      bottom={
        <StatusBar
          state={uiState.state}
          sprintId={uiState.sprintId}
          round={uiState.round}
          costSpent={uiState.costSpent}
          costBudget={uiState.costBudget}
          elapsed={elapsed}
          lastVerdict={uiState.lastVerdict}
          error={uiState.error}
        />
      }
      overlay={
        uiState.pendingDecision ? (
          <DecisionModal
            decision={uiState.pendingDecision}
            onResolve={(resolution) => orchestrator.resolveDecision(resolution)}
          />
        ) : uiState.done ? (
          <Box paddingX={2} paddingY={1}>
            <Text bold color="green">
              ✅ {uiState.doneSummary ?? 'Done!'}
            </Text>
            <Text color="gray"> — Press Q to exit</Text>
          </Box>
        ) : null
      }
    />
  );
}

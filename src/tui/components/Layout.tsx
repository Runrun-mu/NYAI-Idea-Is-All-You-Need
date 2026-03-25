import React from 'react';
import { Box } from 'ink';

interface LayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  bottom: React.ReactNode;
  overlay?: React.ReactNode;
  header?: React.ReactNode;
}

export function Layout({ left, right, bottom, overlay, header }: LayoutProps) {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {header}
      <Box flexDirection="row" flexGrow={1}>
        {left}
        {right}
      </Box>
      {bottom}
      {overlay}
    </Box>
  );
}

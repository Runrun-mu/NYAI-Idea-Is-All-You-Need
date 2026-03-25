import { useInput } from 'ink';
import { useCallback } from 'react';

export type KeyAction = 'decisions' | 'report' | 'spec' | 'log-level' | 'quit';

interface UseKeyboardOptions {
  onAction: (action: KeyAction) => void;
  onAbort: () => void;
  enabled?: boolean;
}

export function useKeyboard({ onAction, onAbort, enabled = true }: UseKeyboardOptions) {
  useInput(
    (input, key) => {
      if (!enabled) return;

      // Ctrl+C — abort
      if (key.ctrl && input === 'c') {
        onAbort();
        return;
      }

      const upper = input.toUpperCase();
      switch (upper) {
        case 'D':
          onAction('decisions');
          break;
        case 'R':
          onAction('report');
          break;
        case 'S':
          onAction('spec');
          break;
        case 'L':
          onAction('log-level');
          break;
        case 'Q':
          onAction('quit');
          break;
      }
    },
  );
}

export interface Notifier {
  notify(event: string, message: string, metadata?: Record<string, unknown>): Promise<void>;
}

export class TerminalNotifier implements Notifier {
  async notify(event: string, message: string): Promise<void> {
    console.log(`[GanAI] ${event}: ${message}`);
  }
}

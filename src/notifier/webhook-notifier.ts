import type { Notifier } from './notifier';

export class WebhookNotifier implements Notifier {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async notify(
    event: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[NYAI] ${event}: ${message}`,
          event,
          message,
          metadata,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error(`[NYAI] Failed to send webhook: ${err}`);
    }
  }
}

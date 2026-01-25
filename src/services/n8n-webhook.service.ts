import { N8nCallbackPayload } from '../types';
import { logger } from '../utils/logger';

/**
 * N8N Webhook service for sending callbacks
 */
export class N8nWebhookService {
  private webhookUrl: string;
  private enabled: boolean;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || '';
    this.enabled = !!this.webhookUrl;

    if (this.enabled) {
      logger.info(`N8N Webhook service initialized: ${this.maskUrl(this.webhookUrl)}`);
    } else {
      logger.warn('N8N Webhook service disabled (no URL provided)');
    }
  }

  /**
   * Send callback to N8N webhook
   */
  async sendCallback(payload: N8nCallbackPayload): Promise<void> {
    if (!this.enabled) {
      logger.debug('N8N webhook disabled, skipping callback');
      return;
    }

    try {
      logger.info(`Sending callback to N8N for ${payload.phone} (status: ${payload.status})`);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`N8N webhook returned ${response.status}: ${errorText}`);
      }

      logger.info(`✅ N8N callback sent successfully for ${payload.phone}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send N8N callback for ${payload.phone}:`, error.message);
      // Don't throw - we don't want to fail the message processing because of webhook issues
    }
  }

  /**
   * Mask webhook URL for logging (show only last 8 chars)
   */
  private maskUrl(url: string): string {
    if (url.length <= 8) return url;
    const lastPart = url.slice(-8);
    return `***${lastPart}`;
  }

  /**
   * Check if webhook is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

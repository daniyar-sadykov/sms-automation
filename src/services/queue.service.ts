import PQueue from 'p-queue';
import { MessageStatus, WebhookPayload, N8nCallbackPayload } from '../types';
import { OpenPhoneService } from './openphone.service';
import { SupabaseService } from './supabase.service';
import { N8nWebhookService } from './n8n-webhook.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  randomDelay,
  sleep,
  hashText,
  isRetryableError,
  sanitizePhone,
  saveMediaFiles,
  cleanupMediaFiles,
} from '../utils/helpers';

/**
 * Message queue service with retry logic
 */
export class QueueService {
  private queue: PQueue;
  private openPhoneService: OpenPhoneService;
  private supabaseService: SupabaseService;
  private n8nWebhookService: N8nWebhookService;
  private isProcessing = false;

  constructor(
    openPhoneService: OpenPhoneService,
    supabaseService: SupabaseService,
    n8nWebhookService: N8nWebhookService
  ) {
    this.openPhoneService = openPhoneService;
    this.supabaseService = supabaseService;
    this.n8nWebhookService = n8nWebhookService;

    // Initialize queue with concurrency of 1 (sequential processing)
    this.queue = new PQueue({ concurrency: 1 });

    logger.info('Queue service initialized');
  }

  /**
   * Add message to queue
   */
  async addMessage(payload: WebhookPayload): Promise<void> {
    logger.info(`Adding message to queue: ${sanitizePhone(payload.phone)}`);
    this.queue.add(() => this.processMessage(payload));
    logger.info(`Queue size: ${this.queue.size}, pending: ${this.queue.pending}`);
  }

  /**
   * Process single message with retry logic
   */
  private async processMessage(payload: WebhookPayload): Promise<void> {
    const { phone, text, external_id, media } = payload;
    let attempt = 0;
    let lastError: any = null;
    let mediaFilePaths: string[] = [];

    logger.info(`Processing message for ${sanitizePhone(phone)}${media ? ` with ${media.length} media file(s)` : ''}`);

    // Save media files to disk if provided
    if (media && media.length > 0) {
      try {
        const uniqueId = `${Date.now()}_${phone.replace(/[^0-9]/g, '')}`;
        mediaFilePaths = saveMediaFiles(media, uniqueId);
        logger.info(`Saved ${mediaFilePaths.length} media file(s) to temp directory`);
      } catch (error: any) {
        logger.error('Failed to save media files:', error.message);
        // Continue without media if save fails
        mediaFilePaths = [];
      }
    }

    try {
      while (attempt < config.queue.maxRetries) {
        attempt++;

        try {
          // Log attempt start
          await this.logAttempt(
            phone,
            text,
            external_id,
            attempt,
            MessageStatus.SENDING
          );

          // Send message (with optional media)
          const result = await this.openPhoneService.sendMessage(phone, text, mediaFilePaths.length > 0 ? mediaFilePaths : undefined);

        if (result.success) {
          // Log success
          await this.logAttempt(
            phone,
            text,
            external_id,
            attempt,
            MessageStatus.SENT,
            undefined,
            undefined,
            result.durationMs
          );

          logger.info(
            `Message sent successfully to ${sanitizePhone(phone)} on attempt ${attempt}`
          );

          // 📸 Upload screenshots to Supabase Storage
          let screenshotUrls: string[] = [];
          if (result.screenshotPaths && result.screenshotPaths.length > 0) {
            logger.info(`Uploading ${result.screenshotPaths.length} screenshots to Supabase...`);
            screenshotUrls = await this.supabaseService.uploadScreenshots(
              result.screenshotPaths
            );
            logger.info(`✅ Uploaded ${screenshotUrls.length} screenshots to Supabase`);
          }

          // 🎯 ОТПРАВИТЬ CALLBACK В N8N
          await this.n8nWebhookService.sendCallback({
            success: true,
            status: MessageStatus.SENT,
            phone,
            external_id,
            timestamp: new Date().toISOString(),
            attempt,
            duration_ms: result.durationMs,
            screenshot_urls: screenshotUrls, // Send Supabase Storage URLs
          });

          // Random delay before next message
          const delay = randomDelay(config.queue.minDelay, config.queue.maxDelay);
          logger.info(`Waiting ${delay}ms before next message...`);
          await sleep(delay);

          return;
        } else {
          lastError = result;

          // Check if error is retryable
          if (
            attempt < config.queue.maxRetries &&
            result.errorCode &&
            isRetryableError({ message: result.errorCode, name: result.errorCode })
          ) {
            // Log retry
            await this.logAttempt(
              phone,
              text,
              external_id,
              attempt,
              MessageStatus.RETRYING,
              result.errorCode,
              result.error,
              result.durationMs,
              result.screenshotPath
            );

            logger.warn(
              `Retryable error for ${sanitizePhone(phone)}, attempt ${attempt}/${
                config.queue.maxRetries
              }: ${result.error}`
            );

            // 📸 Upload screenshots to Supabase Storage (if any)
            let screenshotUrls: string[] = [];
            if (result.screenshotPaths && result.screenshotPaths.length > 0) {
              screenshotUrls = await this.supabaseService.uploadScreenshots(
                result.screenshotPaths
              );
            }

            // 🎯 ОТПРАВИТЬ CALLBACK В N8N (RETRYING)
            await this.n8nWebhookService.sendCallback({
              success: false,
              status: MessageStatus.RETRYING,
              phone,
              external_id,
              timestamp: new Date().toISOString(),
              attempt,
              duration_ms: result.durationMs,
              error: {
                code: result.errorCode,
                message: result.error,
              },
              screenshot_url: result.screenshotPath,
              screenshot_urls: screenshotUrls,
            });

            // Wait before retry (exponential backoff)
            const retryDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
            logger.info(`Waiting ${retryDelay}ms before retry...`);
            await sleep(retryDelay);
            continue;
          } else {
            // Non-retryable error or max retries reached
            await this.logAttempt(
              phone,
              text,
              external_id,
              attempt,
              MessageStatus.FAILED,
              result.errorCode,
              result.error,
              result.durationMs,
              result.screenshotPath
            );

            logger.error(
              `Message failed for ${sanitizePhone(phone)} after ${attempt} attempt(s): ${
                result.error
              }`
            );

            // 📸 Upload screenshots to Supabase Storage (if any)
            let screenshotUrls: string[] = [];
            if (result.screenshotPaths && result.screenshotPaths.length > 0) {
              screenshotUrls = await this.supabaseService.uploadScreenshots(
                result.screenshotPaths
              );
            }

            // 🎯 ОТПРАВИТЬ CALLBACK В N8N (FAILED)
            await this.n8nWebhookService.sendCallback({
              success: false,
              status: MessageStatus.FAILED,
              phone,
              external_id,
              timestamp: new Date().toISOString(),
              attempt,
              duration_ms: result.durationMs,
              error: {
                code: result.errorCode,
                message: result.error,
              },
              screenshot_url: result.screenshotPath,
              screenshot_urls: screenshotUrls,
            });

            // Still wait before next message
            const delay = randomDelay(config.queue.minDelay, config.queue.maxDelay);
            await sleep(delay);

            return;
          }
        }
      } catch (error: any) {
        logger.error(
          `Unexpected error processing message for ${sanitizePhone(phone)}:`,
          error
        );

        // Log unexpected error
        await this.logAttempt(
          phone,
          text,
          external_id,
          attempt,
          MessageStatus.FAILED,
          'UNEXPECTED_ERROR',
          error.message
        );

        // 🎯 ОТПРАВИТЬ CALLBACK В N8N (UNEXPECTED ERROR)
        await this.n8nWebhookService.sendCallback({
          success: false,
          status: MessageStatus.FAILED,
          phone,
          external_id,
          timestamp: new Date().toISOString(),
          attempt,
          error: {
            code: 'UNEXPECTED_ERROR',
            message: error.message,
          },
        });

        // Don't retry on unexpected errors
          return;
        }
      }

      // If we get here, all retries failed
      if (lastError) {
        logger.error(
          `All ${config.queue.maxRetries} attempts failed for ${sanitizePhone(phone)}`
        );
      }
    } finally {
      // Cleanup temporary media files
      if (mediaFilePaths.length > 0) {
        cleanupMediaFiles(mediaFilePaths);
        logger.info(`Cleaned up ${mediaFilePaths.length} temporary media file(s)`);
      }
    }
  }

  /**
   * Log message attempt to Supabase
   */
  private async logAttempt(
    phone: string,
    text: string,
    externalId: string | undefined,
    attempt: number,
    status: MessageStatus,
    errorCode?: string,
    errorText?: string,
    durationMs?: number,
    screenshotPath?: string
  ): Promise<void> {
    try {
      await this.supabaseService.logMessage({
        message_timestamp: new Date().toISOString(),
        phone,
        text_hash: hashText(text),
        status,
        attempt,
        error_code: errorCode,
        error_text: errorText,
        screenshot_path: screenshotPath,
        external_id: externalId,
        duration_ms: durationMs,
      });
    } catch (error) {
      logger.error('Failed to log attempt:', error);
      // Don't throw - logging failures shouldn't stop message processing
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      isPaused: this.queue.isPaused,
    };
  }

  /**
   * Pause queue
   */
  pause(): void {
    this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * Resume queue
   */
  resume(): void {
    this.queue.start();
    logger.info('Queue resumed');
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue.clear();
    logger.info('Queue cleared');
  }

  /**
   * Wait for queue to be empty
   */
  async waitForEmpty(): Promise<void> {
    await this.queue.onIdle();
  }
}

import express, { Request, Response, NextFunction } from 'express';
import { QueueService } from '../services/queue.service';
import { WebhookPayload } from '../types';
import { logger } from '../utils/logger';
import { sanitizePhone, createMessagePreview } from '../utils/helpers';

/**
 * Create Express app with webhook endpoints
 */
export function createApp(queueService: QueueService): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  /**
   * Health check endpoint
   */
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: queueService.getStatus(),
    });
  });

  /**
   * Webhook endpoint to receive messages from n8n
   */
  app.post('/webhook/send', async (req, res) => {
    try {
      const payload: WebhookPayload = req.body;

      // Validate payload
      if (!payload.phone || !payload.text) {
        const errorResponse = {
          success: false,
          message: 'Validation failed',
          timestamp: new Date().toISOString(),
          phone: payload.phone ? sanitizePhone(payload.phone) : 'N/A',
          message_preview: payload.text ? createMessagePreview(payload.text) : 'N/A',
          error: 'Missing required fields: phone and text',
          error_code: 'VALIDATION_ERROR',
        };
        return res.status(400).json(errorResponse);
      }

      // Validate phone format (basic check)
      if (!/^\+?[0-9]{10,15}$/.test(payload.phone.replace(/[\s\-()]/g, ''))) {
        const errorResponse = {
          success: false,
          message: 'Invalid phone format',
          timestamp: new Date().toISOString(),
          phone: sanitizePhone(payload.phone),
          message_preview: createMessagePreview(payload.text),
          error: 'Invalid phone number format',
          error_code: 'INVALID_PHONE',
        };
        return res.status(400).json(errorResponse);
      }

      logger.info(
        `Received message request for ${sanitizePhone(payload.phone)} ${
          payload.external_id ? `(ID: ${payload.external_id})` : ''
        }`
      );

      // Add to queue
      await queueService.addMessage(payload);

      // Create response with timestamp and preview
      const response = {
        success: true,
        message: 'Message added to queue',
        timestamp: new Date().toISOString(),
        phone: sanitizePhone(payload.phone),
        message_preview: createMessagePreview(payload.text),
        external_id: payload.external_id,
        queue_status: queueService.getStatus(),
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Error processing webhook:', error);
      const errorResponse = {
        success: false,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
        phone: req.body?.phone ? sanitizePhone(req.body.phone) : 'N/A',
        message_preview: req.body?.text ? createMessagePreview(req.body.text) : 'N/A',
        error: error.message || 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      };
      res.status(500).json(errorResponse);
    }
  });

  /**
   * Batch webhook endpoint (for multiple messages)
   */
  app.post('/webhook/send-batch', async (req, res) => {
    try {
      const messages = req.body.messages || [];

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid messages array',
        });
      }

      logger.info(`Received batch of ${messages.length} messages`);

      // Add all messages to queue
      const results: any[] = [];
      for (const message of messages) {
        if (!message.phone || !message.text) {
          results.push({
            phone: message.phone,
            success: false,
            error: 'Missing required fields',
          });
          continue;
        }

        await queueService.addMessage(message);
        results.push({
          phone: sanitizePhone(message.phone),
          success: true,
          external_id: message.external_id,
        });
      }

      res.json({
        success: true,
        message: `${results.filter((r) => r.success).length} messages added to queue`,
        results,
        queue_status: queueService.getStatus(),
      });
    } catch (error: any) {
      logger.error('Error processing batch webhook:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  });

  /**
   * Queue status endpoint
   */
  app.get('/queue/status', (req, res) => {
    res.json({
      success: true,
      status: queueService.getStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Pause queue endpoint
   */
  app.post('/queue/pause', (req, res) => {
    queueService.pause();
    res.json({
      success: true,
      message: 'Queue paused',
      status: queueService.getStatus(),
    });
  });

  /**
   * Resume queue endpoint
   */
  app.post('/queue/resume', (req, res) => {
    queueService.resume();
    res.json({
      success: true,
      message: 'Queue resumed',
      status: queueService.getStatus(),
    });
  });

  /**
   * Clear queue endpoint
   */
  app.post('/queue/clear', (req, res) => {
    queueService.clear();
    res.json({
      success: true,
      message: 'Queue cleared',
      status: queueService.getStatus(),
    });
  });

  /**
   * 404 handler
   */
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
    });
  });

  /**
   * Error handler
   */
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  });

  return app;
}

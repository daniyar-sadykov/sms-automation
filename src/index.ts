import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { OpenPhoneService } from './services/openphone.service';
import { SupabaseService } from './services/supabase.service';
import { N8nWebhookService } from './services/n8n-webhook.service';
import { QueueService } from './services/queue.service';
import { createApp } from './server/app';

/**
 * Main application entry point
 */
async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('OpenPhone Playwright Automation Starting...');
    logger.info('='.repeat(60));

    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();
    logger.info('✓ Configuration valid');

    // Initialize Supabase
    logger.info('Initializing Supabase connection...');
    const supabaseService = new SupabaseService();
    await supabaseService.initialize();
    logger.info('✓ Supabase initialized');

    // Initialize N8N Webhook service
    logger.info('Initializing N8N Webhook service...');
    const n8nWebhookService = new N8nWebhookService(config.n8n.webhookUrl);
    logger.info(
      `✓ N8N Webhook service initialized (enabled: ${n8nWebhookService.isEnabled()})`
    );

    // Initialize OpenPhone service
    logger.info('Initializing OpenPhone Playwright service...');
    const openPhoneService = new OpenPhoneService();
    await openPhoneService.initialize();
    logger.info('✓ OpenPhone service initialized');

    // Initialize Queue service
    logger.info('Initializing Queue service...');
    const queueService = new QueueService(
      openPhoneService,
      supabaseService,
      n8nWebhookService
    );
    logger.info('✓ Queue service initialized');

    // Create Express app
    logger.info('Creating Express server...');
    const app = createApp(queueService);

    // Start server
    const server = app.listen(config.server.port, () => {
      logger.info('='.repeat(60));
      logger.info(`✓ Server is running on port ${config.server.port}`);
      logger.info(`✓ Environment: ${config.server.nodeEnv}`);
      logger.info(
        `✓ Webhook endpoint: http://localhost:${config.server.port}/webhook/send`
      );
      logger.info(
        `✓ Health check: http://localhost:${config.server.port}/health`
      );
      if (n8nWebhookService.isEnabled()) {
        logger.info(`✓ N8N Callbacks: ENABLED`);
      } else {
        logger.info(`⚠️  N8N Callbacks: DISABLED (no webhook URL configured)`);
      }
      logger.info('='.repeat(60));
      logger.info('Ready to receive messages from n8n!');
      logger.info('='.repeat(60));
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Wait for queue to finish
      logger.info('Waiting for queue to finish...');
      queueService.pause();
      await queueService.waitForEmpty();
      logger.info('Queue is empty');

      // Close browser
      logger.info('Closing browser...');
      await openPhoneService.close();
      logger.info('Browser closed');

      logger.info('Shutdown complete');
      process.exit(0);
    };

    // Handle shutdown signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
main();

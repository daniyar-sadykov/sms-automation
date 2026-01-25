import dotenv from 'dotenv';

dotenv.config();

/**
 * Application configuration
 */
export const config = {
  openphone: {
    email: process.env.OPENPHONE_EMAIL || '',
    password: process.env.OPENPHONE_PASSWORD || '',
    url: 'https://my.openphone.com/login',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  queue: {
    minDelay: parseInt(process.env.MIN_DELAY_BETWEEN_MESSAGES || '8000', 10),
    maxDelay: parseInt(process.env.MAX_DELAY_BETWEEN_MESSAGES || '20000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  },
  playwright: {
    headless: process.env.HEADLESS === 'true',
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
  },
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || '',
  },
};

/**
 * Validate configuration
 */
export function validateConfig() {
  const errors: string[] = [];

  if (!config.openphone.email) {
    errors.push('OPENPHONE_EMAIL is required');
  }
  if (!config.openphone.password) {
    errors.push('OPENPHONE_PASSWORD is required');
  }
  if (!config.supabase.url) {
    errors.push('SUPABASE_URL is required');
  }
  if (!config.supabase.key) {
    errors.push('SUPABASE_KEY is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  // N8N webhook is optional - just log warning
  if (!config.n8n.webhookUrl) {
    console.warn('⚠️  N8N_WEBHOOK_URL not set - callbacks to N8N will be disabled');
  }
}

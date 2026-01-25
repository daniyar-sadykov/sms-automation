import crypto from 'crypto';

/**
 * Generate random delay between min and max milliseconds
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate SHA256 hash of text (for privacy in logs)
 */
export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}

/**
 * Generate random typing delay per character
 */
export function randomTypingDelay(): number {
  return randomDelay(30, 120);
}

/**
 * Generate random pause between actions
 */
export function randomActionPause(): number {
  return randomDelay(300, 1200);
}

/**
 * Generate random micro-pause
 */
export function randomMicroPause(): number {
  return randomDelay(500, 2500);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const retryableMessages = [
    'timeout',
    'network',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'Target closed',
    'Navigation timeout',
  ];

  const errorMessage = error?.message?.toLowerCase() || '';
  return retryableMessages.some((msg) => errorMessage.includes(msg.toLowerCase()));
}

/**
 * Sanitize phone number for logging
 */
export function sanitizePhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.substring(0, 3) + '***' + phone.substring(phone.length - 2);
}

/**
 * Create message preview (first 50 chars + "...")
 */
export function createMessagePreview(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Message status
 */
export enum MessageStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

/**
 * Webhook payload from n8n
 */
export interface WebhookPayload {
  phone: string;
  text: string;
  external_id?: string;
}

/**
 * Message send result
 */
export interface MessageResult {
  success: boolean;
  status: MessageStatus;
  error?: string;
  errorCode?: string;
  screenshotPath?: string;
  screenshotPaths?: string[]; // Array of screenshot paths (before, after, error)
  durationMs?: number;
}

/**
 * Message log entry
 */
export interface MessageLog {
  message_timestamp: string;
  phone: string;
  text_hash: string;
  status: MessageStatus;
  attempt: number;
  error_code?: string;
  error_text?: string;
  screenshot_path?: string;
  external_id?: string;
  duration_ms?: number;
}

/**
 * Queue status
 */
export interface QueueStatus {
  size: number;
  pending: number;
  isPaused: boolean;
}

/**
 * N8N webhook callback payload
 */
export interface N8nCallbackPayload {
  success: boolean;
  status: MessageStatus;
  phone: string;
  external_id?: string;
  timestamp: string;
  attempt: number;
  duration_ms?: number;
  error?: {
    code?: string;
    message?: string;
  };
  screenshot_url?: string;
  screenshot_urls?: string[]; // Array of public URLs from Supabase Storage
}

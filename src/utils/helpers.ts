import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MediaFile } from '../types';

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

/**
 * Temporary media files directory
 */
const TEMP_MEDIA_DIR = path.join(process.cwd(), 'temp-media');

/**
 * Ensure temp media directory exists
 */
export function ensureTempMediaDir(): void {
  if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
  }
}

/**
 * Save base64 encoded media file to disk
 * @returns Absolute path to saved file
 */
export function saveMediaFile(media: MediaFile, uniqueId: string): string {
  ensureTempMediaDir();
  
  // Generate unique filename to avoid collisions
  const ext = path.extname(media.filename) || getExtensionFromMimeType(media.mimeType);
  const baseName = path.basename(media.filename, ext);
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${uniqueId}_${safeBaseName}${ext}`;
  const filePath = path.join(TEMP_MEDIA_DIR, fileName);
  
  // Decode base64 and write to file
  const buffer = Buffer.from(media.data, 'base64');
  fs.writeFileSync(filePath, buffer);
  
  return filePath;
}

/**
 * Save multiple media files to disk
 * @returns Array of absolute paths to saved files
 */
export function saveMediaFiles(mediaFiles: MediaFile[], uniqueId: string): string[] {
  return mediaFiles.map((media, index) => {
    const indexedId = `${uniqueId}_${index}`;
    return saveMediaFile(media, indexedId);
  });
}

/**
 * Delete temporary media files
 */
export function cleanupMediaFiles(filePaths: string[]): void {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
  };
  return mimeToExt[mimeType] || '.bin';
}

/** 
 * OpenPhone/Quo MMS limits (from official docs):
 * - Max file size: 5MB per message
 * - Max images: 10 per message
 * - Recommended: <600KB for best carrier compatibility
 * 
 * Note: Quo auto-resizes images exceeding carrier limits
 */
const QUO_MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB - Quo's official limit
const QUO_MAX_ATTACHMENTS = 10; // Max 10 images per message
const RECOMMENDED_SIZE = 600 * 1024; // 600KB - recommended for carrier compatibility

/** Supported MIME types for MMS (Quo supports these) */
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
];

/**
 * Validate single media file (format only, not size)
 */
export function validateMediaFile(media: MediaFile): { valid: boolean; error?: string } {
  // Check required fields
  if (!media.filename || !media.mimeType || !media.data) {
    return { valid: false, error: 'Missing required fields (filename, mimeType, data)' };
  }
  
  // Check supported MIME types
  if (!SUPPORTED_MIME_TYPES.includes(media.mimeType)) {
    return { valid: false, error: `Unsupported MIME type: ${media.mimeType}` };
  }
  
  // Validate base64 format
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(media.data)) {
    return { valid: false, error: 'Invalid base64 encoding' };
  }
  
  return { valid: true };
}

/**
 * Validation result with warnings
 */
export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  totalSizeBytes?: number;
  fileCount?: number;
}

/**
 * Validate all media files including total size check
 * Quo/OpenPhone limits: 5MB total, 10 attachments max
 * Recommended: <600KB for best carrier compatibility
 */
export function validateMediaFiles(mediaFiles: MediaFile[]): MediaValidationResult {
  if (!mediaFiles || mediaFiles.length === 0) {
    return { valid: true, totalSizeBytes: 0, fileCount: 0 };
  }
  
  // Check attachment count
  if (mediaFiles.length > QUO_MAX_ATTACHMENTS) {
    return { 
      valid: false, 
      error: `Too many attachments (${mediaFiles.length}). Maximum is ${QUO_MAX_ATTACHMENTS} files per message.`,
      fileCount: mediaFiles.length
    };
  }
  
  let totalSizeBytes = 0;
  
  for (let i = 0; i < mediaFiles.length; i++) {
    const media = mediaFiles[i];
    
    // Validate format
    const formatValidation = validateMediaFile(media);
    if (!formatValidation.valid) {
      return { valid: false, error: `File ${i + 1} (${media.filename}): ${formatValidation.error}` };
    }
    
    // Calculate actual file size (base64 is ~33% larger than binary)
    const fileSizeBytes = Math.ceil(media.data.length * 0.75);
    totalSizeBytes += fileSizeBytes;
  }
  
  // Check total size limit (Quo's 5MB limit)
  if (totalSizeBytes > QUO_MAX_TOTAL_SIZE) {
    const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
    const maxSizeMB = (QUO_MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0);
    return { 
      valid: false, 
      error: `Total media size (${totalSizeMB}MB) exceeds Quo limit (${maxSizeMB}MB)`,
      totalSizeBytes,
      fileCount: mediaFiles.length
    };
  }
  
  // Add warning if size exceeds recommended for carrier compatibility
  let warning: string | undefined;
  if (totalSizeBytes > RECOMMENDED_SIZE) {
    const totalSizeKB = Math.round(totalSizeBytes / 1024);
    warning = `Total size (${totalSizeKB}KB) exceeds recommended 600KB. Some carriers may have issues receiving. Quo will auto-resize images if needed.`;
  }
  
  return { 
    valid: true, 
    warning,
    totalSizeBytes, 
    fileCount: mediaFiles.length 
  };
}

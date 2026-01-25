import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { MessageLog } from '../types';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

/**
 * Supabase service for logging messages
 */
export class SupabaseService {
  private client: SupabaseClient;
  private tableName = 'message_logs';
  private bucketName = 'screenshots'; // Supabase Storage bucket name

  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.key);
  }

  /**
   * Initialize database table if not exists
   */
  async initialize(): Promise<void> {
    try {
      // Test connection
      const { error } = await this.client.from(this.tableName).select('*').limit(1);

      if (error) {
        logger.warn('Supabase table may not exist. Please create it manually.');
        logger.warn('Required table schema:');
        logger.warn(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id BIGSERIAL PRIMARY KEY,
            message_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            phone VARCHAR(50) NOT NULL,
            text_hash VARCHAR(64),
            status VARCHAR(20) NOT NULL,
            attempt INTEGER DEFAULT 1,
            error_code VARCHAR(100),
            error_text TEXT,
            screenshot_path VARCHAR(500),
            external_id VARCHAR(255),
            duration_ms INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);
      } else {
        logger.info('Supabase connection established successfully');
      }
    } catch (error) {
      logger.error('Failed to initialize Supabase:', error);
      throw error;
    }
  }

  /**
   * Log message to Supabase
   */
  async logMessage(messageLog: MessageLog): Promise<void> {
    try {
      const { error } = await this.client.from(this.tableName).insert([
        {
          message_timestamp: messageLog.message_timestamp,
          phone: messageLog.phone,
          text_hash: messageLog.text_hash,
          status: messageLog.status,
          attempt: messageLog.attempt,
          error_code: messageLog.error_code,
          error_text: messageLog.error_text,
          screenshot_path: messageLog.screenshot_path,
          external_id: messageLog.external_id,
          duration_ms: messageLog.duration_ms,
        },
      ]);

      if (error) {
        logger.error('Failed to log message to Supabase:', error);
        throw error;
      }

      logger.info(
        `Message log saved to Supabase: ${messageLog.phone} - ${messageLog.status}`
      );
    } catch (error) {
      logger.error('Error logging to Supabase:', error);
      // Don't throw - we don't want to fail message sending because of logging issues
    }
  }

  /**
   * Get message logs by external_id
   */
  async getLogsByExternalId(externalId: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('external_id', externalId)
        .order('message_timestamp', { ascending: false });

      if (error) {
        logger.error('Failed to fetch logs from Supabase:', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error fetching logs from Supabase:', error);
      return [];
    }
  }

  /**
   * Get recent message logs
   */
  async getRecentLogs(limit: number = 100): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .order('message_timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch recent logs from Supabase:', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error fetching recent logs from Supabase:', error);
      return [];
    }
  }

  /**
   * Upload screenshot to Supabase Storage
   * @param localFilePath - Local path to the screenshot file
   * @returns Public URL of the uploaded screenshot or undefined if failed
   */
  async uploadScreenshot(localFilePath: string): Promise<string | undefined> {
    try {
      if (!localFilePath || !fs.existsSync(localFilePath)) {
        logger.warn(`Screenshot file not found: ${localFilePath}`);
        return undefined;
      }

      // Read file
      const fileBuffer = fs.readFileSync(localFilePath);
      const fileName = path.basename(localFilePath);
      const timestamp = Date.now();
      const storagePath = `${timestamp}-${fileName}`;

      logger.info(`Uploading screenshot to Supabase Storage: ${storagePath}`);

      // Upload to Supabase Storage
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: false,
        });

      if (error) {
        logger.error('Failed to upload screenshot to Supabase:', error);
        return undefined;
      }

      // Get public URL
      const { data: publicUrlData } = this.client.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;
      logger.info(`✅ Screenshot uploaded successfully: ${publicUrl}`);

      return publicUrl;
    } catch (error) {
      logger.error('Error uploading screenshot to Supabase:', error);
      return undefined;
    }
  }

  /**
   * Upload multiple screenshots and return their public URLs
   * @param screenshotPaths - Array of local file paths
   * @returns Array of public URLs
   */
  async uploadScreenshots(screenshotPaths: string[]): Promise<string[]> {
    const urls: string[] = [];

    for (const filePath of screenshotPaths) {
      const url = await this.uploadScreenshot(filePath);
      if (url) {
        urls.push(url);
      }
    }

    return urls;
  }
}

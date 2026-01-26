import { chromium, Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { MessageStatus, MessageResult } from '../types';
import { logger } from '../utils/logger';
import {
  sleep,
  randomActionPause,
  randomMicroPause,
  randomTypingDelay,
} from '../utils/helpers';

/**
 * OpenPhone Playwright automation service
 */
export class OpenPhoneService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private storageStatePath = path.join(process.cwd(), 'storageState.json');
  private screenshotsDir = path.join(process.cwd(), 'screenshots');
  private currentScreenshots: string[] = []; // Track screenshots for current message

  constructor() {
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Initialize browser and login if needed
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Playwright browser...');
      this.browser = await chromium.launch({
        headless: config.playwright.headless,
        channel: 'chrome',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        slowMo: 100,
      });

      // Try to use saved storage state if exists
      const contextOptions: any = {
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      if (fs.existsSync(this.storageStatePath)) {
        logger.info('Found existing storage state, loading...');
        contextOptions.storageState = this.storageStatePath;
      }

      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();

      // Set default timeout
      this.page.setDefaultTimeout(60000);
      this.page.setDefaultNavigationTimeout(60000);

      // Navigate to OpenPhone inbox
      logger.info('Navigating to inbox...');
      await this.page.goto('https://my.openphone.com/inbox', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await sleep(3000);

      // Check if we're already logged in
      const needsLogin = await this.checkNeedsLogin();
      if (needsLogin) {
        logger.info('Login required, performing login...');
        await this.performLogin();
        // Save storage state after successful login
        await this.context.storageState({ path: this.storageStatePath });
        logger.info('Storage state saved');
        // After login, navigate to inbox again
        logger.info('Navigating to inbox after login...');
        await this.page.goto('https://my.openphone.com/inbox', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await sleep(2000);
      } else {
        logger.info('✅ Already logged in, session restored successfully');
      }

      logger.info('Playwright initialization complete');
    } catch (error) {
      logger.error('Failed to initialize Playwright:', error);
      throw error;
    }
  }

  /**
   * Check if login is needed
   */
  private async checkNeedsLogin(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      const currentUrl = this.page.url();
      logger.info(`Current URL: ${currentUrl}`);

      if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
        logger.info('Detected login page');
        return true;
      }

      if (currentUrl.includes('/inbox') || currentUrl.includes('/messages')) {
        logger.info('Already on inbox/messages page');
        return false;
      }

      const loginButton = await this.page.$('button:has-text("Sign in")');
      const emailInput = await this.page.$('input[type="email"]');
      const needsLogin = !!(loginButton || emailInput);
      logger.info(`Login needed: ${needsLogin}`);
      return needsLogin;
    } catch (error) {
      logger.warn('Could not determine login state:', error);
      return true;
    }
  }

  /**
   * Perform login to OpenPhone (multi-step process)
   */
  private async performLogin(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info('Starting login process...');
      
      // Navigate to login page
      await this.page.goto('https://my.openphone.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(2000);

      // STEP 1: Click "Email & password" button
      logger.info('Step 1: Looking for "Email & password" button...');
      await sleep(2000);
      
      const buttonSelectors = [
        '#root > div > div > div > div._160c0eh1._1458mjr0 > div > div._196bzdu1.wd71g50 > div > div._196bzdu3 > button:nth-child(5)',
        'button:has-text("Email & password")',
        'button:has-text("password")',
        'button span:has-text("password")',
        'button span._196bzdu5:has-text("password")',
      ];

      let emailPasswordButton: ElementHandle | null = null;
      for (const selector of buttonSelectors) {
        try {
          emailPasswordButton = await this.page.$(selector);
          if (emailPasswordButton && (await emailPasswordButton.isVisible())) {
            logger.info(`✅ Found "Email & password" button with selector: ${selector}`);
            await emailPasswordButton.click();
            logger.info('✅ Email & password button clicked');
            await sleep(randomActionPause());
            break;
          }
        } catch (e) {
          logger.info(`Selector ${selector} failed, trying next...`);
        }
      }

      if (!emailPasswordButton) {
        logger.warn('⚠️ Email & password button not found, assuming email input is already visible...');
      }

      // STEP 2: Enter email
      logger.info('Step 2: Waiting for email input field...');
      await sleep(2000);

      const emailSelectors = [
        '#username',
        'input#username',
        'input[placeholder*="Email address"]',
        'input[placeholder*="Email"]',
        'input[type="email"]',
        'input[name="email"]',
        'input[autocomplete="email"]',
        'input[id*="email"]',
        'form input[type="text"]',
        'form input:not([type="password"]):not([type="hidden"])',
      ];

      let emailInput: ElementHandle | null = null;
      for (const selector of emailSelectors) {
        try {
          emailInput = await this.page.$(selector);
          if (emailInput && (await emailInput.isVisible())) {
            logger.info(`✅ Email input found with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!emailInput) {
        throw new Error('Email input not found with any selector');
      }

      logger.info('Typing email address...');
      await emailInput.click();
      await sleep(800);
      await emailInput.fill('');
      await sleep(300);
      await emailInput.type(config.openphone.email, {
        delay: randomTypingDelay(),
      });
      logger.info(`✅ Email entered: ${config.openphone.email}`);
      await sleep(randomMicroPause());

      // STEP 3: Click Continue button
      logger.info('Step 3: Clicking Continue button after email...');
      const continueButtonSelectors1 = [
        'body > div > main > section > div > div > div > div.cbe8a9936.cd39274d8 > div > form > div.c14e5e142 > button',
        'button:has-text("Continue")',
        'button[type="submit"]',
        'button[name="action"]',
      ];

      let continueButton1: ElementHandle | null = null;
      for (const selector of continueButtonSelectors1) {
        try {
          continueButton1 = await this.page.$(selector);
          if (continueButton1 && (await continueButton1.isVisible())) {
            logger.info(`✅ Continue button found with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (continueButton1) {
        await continueButton1.click();
        logger.info('✅ Continue button clicked');
      } else {
        logger.info('Continue button not found, pressing Enter...');
        await this.page.keyboard.press('Enter');
      }

      logger.info('⏳ Waiting for password page to load...');
      await sleep(3000);

      // STEP 4: Enter password
      logger.info('Step 4: Waiting for password input field...');
      const passwordSelectors = [
        '#password',
        'input#password',
        'input[name="password"]',
        'input[type="password"]',
        'input[autocomplete="current-password"]',
        'input.input[type="password"]',
      ];

      let passwordInput: ElementHandle | null = null;
      for (let i = 0; i < passwordSelectors.length; i++) {
        try {
          await this.page.waitForSelector(passwordSelectors[i], {
            timeout: i === 0 ? 10000 : 3000,
            state: 'visible',
          });
          passwordInput = await this.page.$(passwordSelectors[i]);
          if (passwordInput && (await passwordInput.isVisible())) {
            logger.info(`✅ Password input found with selector: ${passwordSelectors[i]}`);
            break;
          }
        } catch (e) {
          logger.info(`Selector ${passwordSelectors[i]} failed, trying next...`);
          if (i === passwordSelectors.length - 1) {
            throw new Error('Password input not found with any selector');
          }
        }
      }

      if (!passwordInput) {
        throw new Error('Password input not found');
      }

      await sleep(randomActionPause());
      logger.info('Typing password...');
      await passwordInput.click();
      await sleep(800);
      await passwordInput.fill('');
      await sleep(300);
      await passwordInput.type(config.openphone.password, {
        delay: randomTypingDelay(),
      });
      logger.info('✅ Password entered');
      await sleep(randomMicroPause());

      // STEP 5: Click Continue button after password
      logger.info('Step 5: Clicking Continue button after password...');
      const continueButtonSelectors2 = [
        'body > div > main > section > div > div > div > form > div.c14e5e142 > button',
        'button:has-text("Continue")',
        'button[type="submit"]',
      ];

      let continueButton2: ElementHandle | null = null;
      for (const selector of continueButtonSelectors2) {
        try {
          continueButton2 = await this.page.$(selector);
          if (continueButton2 && (await continueButton2.isVisible())) {
            logger.info(`✅ Final Continue button found with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (continueButton2) {
        await continueButton2.click();
        logger.info('Final Continue button clicked');
      } else {
        logger.info('Continue button not found, pressing Enter...');
        await this.page.keyboard.press('Enter');
      }

      await sleep(3000);

      // STEP 6: Wait for navigation
      logger.info('Step 6: Waiting for navigation after login...');
      try {
        await this.page.waitForURL('**/inbox**', { timeout: 30000 });
        logger.info('✅ Login successful - redirected to inbox');
      } catch (e) {
        const finalUrl = this.page.url();
        logger.info(`Current URL after login: ${finalUrl}`);
        
        if (finalUrl.includes('verify') || finalUrl.includes('2fa') || finalUrl.includes('mfa')) {
          logger.warn('⚠️  2FA detected! Please complete 2FA manually in the browser.');
          logger.warn('After 2FA, the session will be saved automatically.');
          logger.warn('Waiting up to 2 minutes for manual 2FA completion...');
          await this.page.waitForURL('**/inbox**', { timeout: 120000 });
          logger.info('✅ 2FA completed, now on inbox');
        } else if (finalUrl.includes('signin') || finalUrl.includes('login')) {
          throw new Error('Still on login page - credentials may be incorrect');
        } else {
          logger.warn('Not on inbox page, trying to navigate manually...');
          await this.page.goto('https://my.openphone.com/inbox', {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
        }
      }

      await sleep(2000);
      logger.info('✅ Login process complete');
    } catch (error: any) {
      logger.error('❌ Login failed:', error.message);
      
      // Take screenshot on error
      try {
        const errorScreenshot = path.join(
          this.screenshotsDir,
          `login-error-${Date.now()}.png`
        );
        await this.page?.screenshot({ path: errorScreenshot, fullPage: true });
        logger.info(`Error screenshot saved: ${errorScreenshot}`);
      } catch (screenshotError) {
        logger.error('Failed to take error screenshot:', screenshotError);
      }

      throw new Error('Login failed: ' + error.message);
    }
  }

  /**
   * Send SMS/MMS message
   * @param phone - Phone number to send to
   * @param text - Message text
   * @param mediaFilePaths - Optional array of local file paths for MMS attachments
   */
  async sendMessage(phone: string, text: string, mediaFilePaths?: string[]): Promise<MessageResult> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    let screenshotPath: string | undefined;
    this.currentScreenshots = []; // Reset screenshots array for new message

    try {
      logger.info(`Sending message to ${phone}`);

      // Step 1: Click "New conversation" button
      await this.clickNewConversation();
      await sleep(randomActionPause());

      // Step 2: Enter phone number
      await this.enterPhoneNumber(phone);
      await sleep(3000);

      // Step 3: Enter message text
      await this.enterMessageText(text);
      await sleep(randomActionPause());

      // Step 4: Attach media files if provided (MMS)
      if (mediaFilePaths && mediaFilePaths.length > 0) {
        await this.attachMediaFiles(mediaFilePaths);
        await sleep(randomActionPause());
      }

      // Step 5: Click send button (will capture before/after screenshots)
      await this.clickSendButton();
      await sleep(randomActionPause());

      // Step 6: Verify message was sent
      const success = await this.verifyMessageSent();
      const durationMs = Date.now() - startTime;

      if (success) {
        logger.info(`Message sent successfully to ${phone} in ${durationMs}ms`);
        return {
          success: true,
          status: MessageStatus.SENT,
          durationMs,
          screenshotPaths: this.currentScreenshots, // Return all screenshots
        };
      } else {
        throw new Error('Message sending verification failed');
      }
    } catch (error: any) {
      logger.error(`Failed to send message to ${phone}:`, error);

      // Take screenshot on error
      try {
        const timestamp = Date.now();
        screenshotPath = path.join(
          this.screenshotsDir,
          `error-${timestamp}-${phone.replace(/[^0-9]/g, '')}.png`
        );
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info(`Error screenshot saved: ${screenshotPath}`);
        this.currentScreenshots.push(screenshotPath);
      } catch (screenshotError) {
        logger.error('Failed to take screenshot:', screenshotError);
      }

      return {
        success: false,
        status: MessageStatus.FAILED,
        error: error.message,
        errorCode: error.name || 'UNKNOWN_ERROR',
        screenshotPath,
        screenshotPaths: this.currentScreenshots,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Open new message window using Alt+N hotkey
   */
  private async clickNewConversation(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info('Opening new message window with Alt+N...');
      await this.page.keyboard.press('Alt+N');
      logger.info('✅ Pressed Alt+N to open new message window');
      await sleep(1500);
    } catch (error) {
      logger.error('Failed to open new conversation with Alt+N:', error);
      throw error;
    }
  }

  /**
   * Enter phone number in "To:" field
   */
  private async enterPhoneNumber(phone: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info(`Entering phone number: ${phone}`);
      await sleep(1500);

      const phoneFieldSelectors = [
        'div._184fmnq3',
        'div._184fmnq2 > div._184fmnq3',
        '#main-container > div > main > div.esdmfr4.esdmfr5.xwhz9w0.xwhz9w6 > div.monzvo0 > div.monzvo1 > div.g4ubtn0 > div._160c0eh1.xw761z0 > div > div._184fmnq2 > div._184fmnq3',
        'input[aria-label="participant input"]',
        'input._10wipo31',
      ];

      let phoneFieldClicked = false;
      for (const selector of phoneFieldSelectors) {
        try {
          logger.info(`Trying to click phone field: ${selector}`);
          await this.page
            .waitForSelector(selector, { timeout: 3000, state: 'visible' })
            .catch(() => null);

          const element = await this.page.$(selector);
          if (element && (await element.isVisible())) {
            await element.click();
            logger.info(`✅ Clicked phone field: ${selector}`);
            phoneFieldClicked = true;
            await sleep(500);
            break;
          }
        } catch (e: any) {
          logger.info(`Selector ${selector} failed: ${e.message}`);
          continue;
        }
      }

      if (!phoneFieldClicked) {
        logger.warn('⚠️ Could not click phone field explicitly, will try typing anyway');
      }

      await this.page.keyboard.type(phone, { delay: randomTypingDelay() });
      logger.info(`✅ Typed phone: ${phone}`);
      logger.info('⏳ Waiting for phone number to be processed (no Enter pressed)...');
      await sleep(2000);
    } catch (error) {
      logger.error('Failed to enter phone number:', error);
      throw error;
    }
  }

  /**
   * Enter message text
   */
  private async enterMessageText(text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info('Entering message text...');
      await sleep(1500);

      const messageFieldSelectors = [
        'p[aria-label="message input"]',
        '[aria-label="message input"]',
        'p[role="paragraph"]',
      ];

      for (const selector of messageFieldSelectors) {
        try {
          logger.info(`Trying selector for message field: ${selector}`);
          await this.page
            .waitForSelector(selector, { timeout: 5000, state: 'visible' })
            .catch(() => null);

          const element = await this.page.$(selector);
          if (element && (await element.isVisible())) {
            logger.info(`✅ Found message field with selector: ${selector}`);
            await element.click();
            await sleep(500);
            await this.page.keyboard.type(text, { delay: randomTypingDelay() });
            logger.info(`✅ Entered message text (${text.length} characters)`);
            await sleep(500);
            return;
          }
        } catch (e: any) {
          logger.info(`Selector ${selector} failed: ${e.message}`);
          continue;
        }
      }

      // Fallback
      logger.warn('⚠️ ARIA selectors failed, trying fallback approach...');
      logger.info('Using Tab key to focus message field...');
      await this.page.keyboard.press('Tab');
      await sleep(500);
      await this.page.keyboard.type(text, { delay: randomTypingDelay() });
      logger.info(`✅ Entered message text via Tab+Type (${text.length} characters)`);
      await sleep(500);
    } catch (error) {
      logger.error('Failed to enter message text:', error);
      throw error;
    }
  }

  /**
   * Attach media files to message (for MMS)
   */
  private async attachMediaFiles(filePaths: string[]): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info(`Attaching ${filePaths.length} media file(s)...`);

      // Look for attachment button or file input
      // OpenPhone typically has an attachment button that triggers a file input
      const attachButtonSelectors = [
        'button[aria-label="Attach"]',
        'button[aria-label="Attachment"]',
        'button[aria-label="Add attachment"]',
        '[data-testid="attachment-button"]',
        '[data-testid="attach-button"]',
        'button svg[data-testid="AttachmentIcon"]',
        'button:has(svg[class*="attachment"])',
        // Иконка скрепки или плюса
        'button:has(svg path[d*="M16.5"])',
        'button._1rh31vu1', // OpenPhone specific class
      ];

      let attachButton: ElementHandle | null = null;
      for (const selector of attachButtonSelectors) {
        try {
          attachButton = await this.page.$(selector);
          if (attachButton && (await attachButton.isVisible())) {
            logger.info(`✅ Found attachment button: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Method 1: Try clicking attachment button to reveal file input
      if (attachButton) {
        await attachButton.click();
        logger.info('Clicked attachment button');
        await sleep(1000);
      }

      // Method 2: Look for file input (visible or hidden)
      const fileInputSelectors = [
        'input[type="file"]',
        'input[accept*="image"]',
        'input[accept*="video"]',
        'input[accept*="pdf"]',
      ];

      let fileInput: ElementHandle | null = null;
      for (const selector of fileInputSelectors) {
        try {
          fileInput = await this.page.$(selector);
          if (fileInput) {
            logger.info(`✅ Found file input: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (fileInput) {
        // Use Playwright's setInputFiles to upload files
        await (fileInput as any).setInputFiles(filePaths);
        logger.info(`✅ Attached ${filePaths.length} file(s) via file input`);
        await sleep(2000); // Wait for files to be processed
        
        // Take screenshot after attachment
        const attachScreenshot = path.join(
          this.screenshotsDir,
          `after-attach-${Date.now()}.png`
        );
        await this.page.screenshot({ path: attachScreenshot, fullPage: true });
        logger.info(`📸 Screenshot after attachment: ${attachScreenshot}`);
        this.currentScreenshots.push(attachScreenshot);
      } else {
        // Method 3: Try drag and drop as fallback
        logger.warn('⚠️ File input not found, trying drag-and-drop fallback...');
        
        // Find the message area for drag-and-drop
        const dropZoneSelectors = [
          '[aria-label="message input"]',
          'div[contenteditable="true"]',
          '.message-composer',
          '[data-testid="message-input"]',
        ];

        let dropZone: ElementHandle | null = null;
        for (const selector of dropZoneSelectors) {
          try {
            dropZone = await this.page.$(selector);
            if (dropZone && (await dropZone.isVisible())) {
              logger.info(`Found drop zone: ${selector}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (dropZone) {
          // Read file and create DataTransfer for drag-and-drop
          for (const filePath of filePaths) {
            const fileName = path.basename(filePath);
            const fileBuffer = fs.readFileSync(filePath);
            
            // Dispatch drop event with file (runs in browser context)
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            await this.page.evaluate(new Function('args', `
              const { fileName, fileData, mimeType } = args;
              const uint8Array = new Uint8Array(
                atob(fileData)
                  .split('')
                  .map(c => c.charCodeAt(0))
              );
              const file = new File([uint8Array], fileName, { type: mimeType });
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);

              const dropZone = document.querySelector('[aria-label="message input"]') ||
                               document.querySelector('div[contenteditable="true"]');
              if (dropZone) {
                const dropEvent = new DragEvent('drop', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer,
                });
                dropZone.dispatchEvent(dropEvent);
              }
            `) as any, {
              fileName,
              fileData: fileBuffer.toString('base64'),
              mimeType: this.getMimeType(filePath),
            });
            logger.info(`Dropped file via drag-and-drop: ${fileName}`);
          }
          await sleep(2000);
        } else {
          logger.error('❌ Could not find attachment method (button, input, or drop zone)');
          throw new Error('No attachment method available');
        }
      }

      logger.info(`✅ Media attachment complete`);
    } catch (error: any) {
      logger.error('Failed to attach media files:', error.message);
      throw error;
    }
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Send message using Enter hotkey
   */
  private async clickSendButton(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info('Sending message with Enter key...');
      await sleep(1000);

      // Screenshot before sending
      const beforeSendPath = path.join(
        this.screenshotsDir,
        `before-send-${Date.now()}.png`
      );
      await this.page.screenshot({ path: beforeSendPath, fullPage: true });
      logger.info(`📸 Screenshot BEFORE Send: ${beforeSendPath}`);
      this.currentScreenshots.push(beforeSendPath); // Add to array

      await this.page.keyboard.press('Enter');
      logger.info('✅ Pressed Enter to send message');
      await sleep(500);

      // Screenshot after sending
      const afterSendPath = path.join(
        this.screenshotsDir,
        `after-send-${Date.now()}.png`
      );
      await this.page.screenshot({ path: afterSendPath, fullPage: true });
      logger.info(`📸 Screenshot AFTER Send: ${afterSendPath}`);
      this.currentScreenshots.push(afterSendPath); // Add to array

      await sleep(1500);
    } catch (error) {
      logger.error('Failed to send with Enter:', error);
      throw error;
    }
  }

  /**
   * Verify message was sent successfully
   */
  private async verifyMessageSent(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info('⏳ Waiting for message to be sent (8 seconds)...');
      await sleep(8000);

      const screenshotPath = `screenshots/after-send-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath });
      logger.info(`📸 Screenshot saved: ${screenshotPath}`);

      const errorSelectors = [
        '[role="alert"]',
        '[role="alertdialog"]',
        '[class*="error"][role="alert"]',
        '[class*="notification"][class*="error"]',
        '[data-testid*="error"]',
        '[data-testid*="alert"]',
        '[role="alert"] >> text=/invalid|failed|error/i',
        '[class*="toast"][class*="error"]',
        '[class*="snackbar"][class*="error"]',
      ];

      for (const selector of errorSelectors) {
        try {
          const errorElement = await this.page.$(selector);
          if (errorElement) {
            const errorText = await errorElement.textContent();
            logger.error(`❌ Detected error message: ${errorText}`);
            return false;
          }
        } catch (e) {
          continue;
        }
      }

      logger.info('✅ No error indicators found, message likely sent');
      logger.info('📸 Please check screenshot to confirm');
      return true;
    } catch (error) {
      logger.warn('Could not verify message status:', error);
      return true;
    }
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      logger.info('Browser closed');
    } catch (error) {
      logger.error('Error closing browser:', error);
    }
  }

  /**
   * Check if browser is initialized
   */
  isInitialized(): boolean {
    return !!(this.browser && this.context && this.page);
  }
}

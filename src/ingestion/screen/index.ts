/// <reference path="../../types/modules.d.ts" />
import screenshot from 'screenshot-desktop';
import * as tesseract from 'tesseract.js';
import * as crypto from 'crypto';
import { DBService } from '@/core/db';

export class ScreenIngestor {
  private intervalId: NodeJS.Timeout | null = null;
  private lastHash: string | null = null;

  constructor(
    private dbService: DBService,
    private captureIntervalMs: number = 5000 // default to 5s
  ) {}

  public start() {
    console.log(`[ScreenIngestor] Starting periodic screen capture every ${this.captureIntervalMs}ms`);
    
    // Kick off loop immediately
    this.captureAndProcess();

    this.intervalId = setInterval(() => {
      this.captureAndProcess();
    }, this.captureIntervalMs);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ScreenIngestor] Stopped screen capture.');
    }
  }

  private async captureAndProcess() {
    try {
      // 1. Capture Screen
      const imgBuffer = await screenshot({ format: 'png' });
      
      // 2. Hash buffer to detect if screen actually changed
      const hash = crypto.createHash('sha256').update(imgBuffer).digest('hex');
      if (this.lastHash === hash) {
        // Screen hasn't changed, skip OCR
        return;
      }
      this.lastHash = hash;

      console.log(`[ScreenIngestor] Screen changed (Hash: ${hash.substring(0, 8)}...). Running local OCR...`);

      // 3. Local OCR using Tesseract.js
      const { data } = await tesseract.recognize(imgBuffer, 'eng', {
        logger: m => {} // suppress progress logs for cleaner output
      });

      const text = data.text.trim();

      if (!text) {
        return;
      }

      // 4. Save to OmniMemory (redaction happens automatically in insertMemoryChunk)
      await this.dbService.insertMemoryChunk(text, {
        sourceType: 'screen',
        appName: 'Desktop', // We could use native bindings to get active window, but keeping it simple for now
        windowTitle: 'Active Screen'
      });
      
      console.log(`[ScreenIngestor] Indexed ${text.length} characters of screen text.`);

    } catch (error) {
      console.error('[ScreenIngestor] Error during screen capture/OCR:', error);
    }
  }
}

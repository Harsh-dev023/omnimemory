import { DBService } from '@/core/db';
import { TerminalIngestor } from '@/ingestion/terminal';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars
dotenv.config();

const dbPath = process.env.DB_PATH || './data/omnimemory.db';
// Ensure data dir exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export async function runDaemon() {
  console.log('[OmniMemory] Initializing daemon...');
  const dbService = new DBService(dbPath);

  // If started with terminal mode, hijack current IO for PTY session
  if (process.argv.includes('--terminal')) {
    console.log('[OmniMemory] Starting embedded terminal session. All output is securely indexed.');
    
    // Set raw mode for proper TTY passthrough
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    const ingestor = new TerminalIngestor(dbService);
    
    // Graceful shutdown
    const cleanup = () => {
      ingestor.kill();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } else {
    // Background daemon mode for Screen Capture (Slice 3)
    console.log('[OmniMemory] Daemon running in background. Screen Capture is active.');
    
    const { ScreenIngestor } = require('@/ingestion/screen');
    const screenIngestor = new ScreenIngestor(dbService, 10000); // 10s interval to not overload CPU
    screenIngestor.start();

    // Setup Global Hotkey Listener (Mac: Cmd+Shift+Space)
    const { GlobalKeyboardListener } = require('node-global-key-listener');
    const v = new GlobalKeyboardListener();
    console.log('[OmniMemory] Global Hotkey Listener Active: Press Cmd + Shift + Space to search.');

    v.addListener((e: any, down: any) => {
      if (
        e.state === 'DOWN' && 
        e.name === 'SPACE' && 
        (down['LEFT META'] || down['RIGHT META']) && 
        (down['LEFT SHIFT'] || down['RIGHT SHIFT'])
      ) {
        console.log('[OmniMemory] Hotkey pressed! Launching search UI...');
        // Open interactive search in a new Terminal window on Mac
        const exec = require('child_process').exec;
        const projectDir = path.resolve(__dirname, '..');
        exec(`osascript -e 'tell app "Terminal" to do script "cd \\"${projectDir}\\" && npm run cli"'`);
      }
    });

    // Graceful shutdown
    const cleanup = () => {
      screenIngestor.stop();
      v.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

if (require.main === module) {
  runDaemon().catch(err => {
    console.error('Daemon crashed:', err);
    process.exit(1);
  });
}

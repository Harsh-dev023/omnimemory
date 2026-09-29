import * as pty from 'node-pty';
import * as os from 'os';
import { DBService } from '@/core/db';

export class TerminalIngestor {
  private ptyProcess: pty.IPty;
  private buffer: string = '';
  // Flush buffer to DB every FLUSH_INTERVAL ms to batch commands & outputs
  private static FLUSH_INTERVAL = 2000;
  private flushTimer: NodeJS.Timeout | null = null;
  
  constructor(private dbService: DBService, customShell?: string) {
    const fs = require('fs');
    const isWin = os.platform() === 'win32';
    const shellCandidates = isWin 
      ? [customShell, process.env.COMSPEC, 'powershell.exe', 'cmd.exe']
      : [customShell, process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'];
    const resolvedShell = shellCandidates.find(s => s && (isWin && (s === 'powershell.exe' || s === 'cmd.exe') ? true : fs.existsSync(s))) || (isWin ? 'cmd.exe' : '/bin/sh');

    this.ptyProcess = pty.spawn(resolvedShell, [], {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 30,
      cwd: process.env.HOME || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' } as { [key: string]: string }
    });

    this.ptyProcess.onData((data) => {
      // Strip basic ANSI escape codes for cleaner storage
      const cleanData = data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      this.buffer += cleanData;

      // Reset timer on new data
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
      }
      this.flushTimer = setTimeout(() => this.flushBuffer(), TerminalIngestor.FLUSH_INTERVAL);

      // Print to actual process so user can use the terminal normally
      process.stdout.write(data);
    });

    // Capture user input and forward to PTY
    process.stdin.on('data', (data) => {
      this.ptyProcess.write(data.toString());
    });
  }

  private async flushBuffer() {
    if (!this.buffer.trim()) {
      return;
    }

    try {
      const chunk = this.buffer.trim();
      this.buffer = ''; // Clear buffer immediately
      
      await this.dbService.insertMemoryChunk(chunk, {
        sourceType: 'terminal',
        appName: process.env.SHELL || 'terminal',
        windowTitle: 'OmniMemory PTY Session'
      });
    } catch (error) {
      console.error('Failed to flush terminal buffer to OmniMemory DB:', error);
    }
  }

  public kill() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.ptyProcess.kill();
  }
}

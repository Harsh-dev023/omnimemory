import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { z } from 'zod';
import { DBService } from '@/core/db';

/**
 * 1. User Configuration Schema & Manager
 */
export const ConfigSchema = z.object({
  retentionDays: z.number().int().min(1).default(30),
  entropyThreshold: z.number().min(1.0).max(8.0).default(4.5),
  customSecretRegexes: z.array(z.string()).default([]),
  blacklistedApps: z.array(z.string()).default(['1Password', 'Bitwarden', 'Keychain Access', 'Signal']),
  hotkey: z.string().default('CommandOrControl+Shift+Space'),
});

export type OmniConfig = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private configPath: string;
  private currentConfig: OmniConfig;

  constructor(customPath?: string) {
    const configDir = path.join(os.homedir(), '.config', 'omnimemory');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.configPath = customPath || path.join(configDir, 'config.json');
    this.currentConfig = this.loadConfig();
  }

  public loadConfig(): OmniConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileData = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(fileData);
        return ConfigSchema.parse(parsed);
      }
    } catch (err) {
      console.warn('[ConfigManager] Failed to read config, falling back to defaults:', err);
    }
    const defaults = ConfigSchema.parse({});
    this.saveConfig(defaults);
    return defaults;
  }

  public saveConfig(config: OmniConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    this.currentConfig = config;
  }

  public getConfig(): OmniConfig {
    return this.currentConfig;
  }
}

/**
 * 2. Retention & Database Maintenance Worker
 */
export class RetentionWorker {
  private dbService: DBService;
  private retentionDays: number;

  constructor(dbService: DBService, retentionDays = 30) {
    this.dbService = dbService;
    this.retentionDays = retentionDays;
  }

  public async runCleanup(): Promise<number> {
    const cutoffTimestamp = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    
    // Deletes expired entries and rebuilds/vacuums vector & FTS virtual tables
    const db = this.dbService.getRawDbHandle();
    
    // Match schema: MemoryChunk & MemoryFTS
    const stmt = db.prepare(`
      DELETE FROM MemoryChunk 
      WHERE strftime('%s', timestamp) * 1000 < ?
    `);

    const result = stmt.run(cutoffTimestamp);
    
    if (result.changes > 0) {
      db.exec(`
        INSERT INTO MemoryFTS(MemoryFTS) VALUES('rebuild');
        PRAGMA incremental_vacuum;
      `);
      console.log(`[RetentionWorker] Successfully pruned ${result.changes} expired context chunks older than ${this.retentionDays} days.`);
    }

    return result.changes;
  }
}

/**
 * 3. System Background Service Installer (launchd / systemd)
 */
export class ServiceInstaller {
  public static install(): void {
    const platform = os.platform();
    const nodeBinary = process.execPath;
    const daemonScript = path.resolve(__dirname, '../../daemon.js');

    if (platform === 'darwin') {
      ServiceInstaller.installMacOS(nodeBinary, daemonScript);
    } else if (platform === 'linux') {
      ServiceInstaller.installLinux(nodeBinary, daemonScript);
    } else {
      throw new Error(`Automatic service installation is not supported on platform: ${platform}`);
    }
  }

  public static uninstall(): void {
    const platform = os.platform();
    if (platform === 'darwin') {
      ServiceInstaller.uninstallMacOS();
    } else if (platform === 'linux') {
      ServiceInstaller.uninstallLinux();
    }
  }

  private static installMacOS(nodePath: string, daemonPath: string): void {
    const label = 'com.omnimemory.daemon';
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${daemonPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(os.homedir(), '.config/omnimemory/daemon.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(os.homedir(), '.config/omnimemory/daemon.err')}</string>
</dict>
</plist>`;

    fs.writeFileSync(plistPath, plistContent, 'utf-8');
    execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
    execSync(`launchctl load -w "${plistPath}"`);
    console.log(`[ServiceInstaller] macOS LaunchAgent installed & loaded at: ${plistPath}`);
  }

  private static uninstallMacOS(): void {
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.omnimemory.daemon.plist');
    if (fs.existsSync(plistPath)) {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      fs.unlinkSync(plistPath);
      console.log(`[ServiceInstaller] macOS LaunchAgent removed.`);
    }
  }

  private static installLinux(nodePath: string, daemonPath: string): void {
    const serviceDir = path.join(os.homedir(), '.config/systemd/user');
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }

    const servicePath = path.join(serviceDir, 'omnimemory.service');
    const serviceContent = `[Unit]
Description=OmniMemory Ambient Context Engine Daemon
After=network.target

[Service]
ExecStart=${nodePath} ${daemonPath}
Restart=always
RestartSec=5
StandardOutput=append:${path.join(os.homedir(), '.config/omnimemory/daemon.log')}
StandardError=append:${path.join(os.homedir(), '.config/omnimemory/daemon.err')}

[Install]
WantedBy=default.target`;

    fs.writeFileSync(servicePath, serviceContent, 'utf-8');
    execSync('systemctl --user daemon-reload');
    execSync('systemctl --user enable --now omnimemory.service');
    console.log(`[ServiceInstaller] Linux systemd user service installed & started at: ${servicePath}`);
  }

  private static uninstallLinux(): void {
    const servicePath = path.join(os.homedir(), '.config/systemd/user/omnimemory.service');
    if (fs.existsSync(servicePath)) {
      execSync('systemctl --user stop omnimemory.service 2>/dev/null || true');
      execSync('systemctl --user disable omnimemory.service 2>/dev/null || true');
      fs.unlinkSync(servicePath);
      execSync('systemctl --user daemon-reload');
      console.log(`[ServiceInstaller] Linux systemd service removed.`);
    }
  }
}

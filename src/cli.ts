import process from 'process';
import readline from 'readline';
import { DBService } from '@/core/db';
import { SearchEngine } from '@/core/search';
import { ConfigManager, RetentionWorker, ServiceInstaller } from '@/core/service';

/**
 * Renders interactive search results to the terminal.
 */
async function runInteractiveSearch(initialQuery?: string): Promise<void> {
  const configManager = new ConfigManager();
  const dbService = new DBService();
  await dbService.initialize();

  const searchEngine = new SearchEngine(dbService);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const query = initialQuery || (await new Promise<string>((resolve) => {
    rl.question('\n🔍 OmniMemory Search: ', (answer) => resolve(answer.trim()));
  }));

  if (!query) {
    console.log('No search query provided.');
    rl.close();
    dbService.close();
    return;
  }

  console.log(`\nSearching for: "${query}"...\n`);
  const results = await searchEngine.hybridSearch(query, 5);

  if (results.length === 0) {
    console.log('No matching context found.');
  } else {
    results.forEach((res, idx) => {
      console.log(`--- [Result ${idx + 1}] (${res.appName || 'system'}) ---`);
      console.log(`Timestamp : ${res.timestamp}`);
      if (res.windowTitle) {
        console.log(`Window    : ${res.windowTitle}`);
      }
      console.log(`Snippet   :\n${(res.content || '').trim()}`);
      console.log('--------------------------------------------\n');
    });
  }

  rl.close();
  dbService.close();
}

/**
 * Handles 'service' subcommands (install / uninstall).
 */
function handleServiceCommand(subcommand: string): void {
  switch (subcommand) {
    case 'install':
      ServiceInstaller.install();
      console.log('✔ OmniMemory background daemon service installed successfully.');
      break;
    case 'uninstall':
      ServiceInstaller.uninstall();
      console.log('✔ OmniMemory background daemon service uninstalled.');
      break;
    default:
      console.error(`Unknown service command: "${subcommand}". Usage: omnimemory service [install|uninstall]`);
      process.exit(1);
  }
}

/**
 * Handles 'config' subcommands (get / set).
 */
function handleConfigCommand(args: string[]): void {
  const configManager = new ConfigManager();
  const action = args[0];

  if (!action || action === 'get') {
    const key = args[1];
    const config = configManager.getConfig();
    if (key) {
      if (key in config) {
        console.log(`${key} = ${JSON.stringify(config[key as keyof typeof config])}`);
      } else {
        console.error(`Unknown configuration key: "${key}"`);
        process.exit(1);
      }
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
    return;
  }

  if (action === 'set') {
    const key = args[1];
    const rawValue = args[2];

    if (!key || rawValue === undefined) {
      console.error('Usage: omnimemory config set <key> <value>');
      process.exit(1);
    }

    const currentConfig = configManager.getConfig();
    if (!(key in currentConfig)) {
      console.error(`Unknown configuration key: "${key}"`);
      process.exit(1);
    }

    try {
      let parsedValue: unknown = rawValue;
      if (rawValue === 'true') parsedValue = true;
      else if (rawValue === 'false') parsedValue = false;
      else if (!isNaN(Number(rawValue))) parsedValue = Number(rawValue);
      else if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
        parsedValue = JSON.parse(rawValue);
      }

      const updatedConfig = { ...currentConfig, [key]: parsedValue };
      configManager.saveConfig(updatedConfig as typeof currentConfig);
      console.log(`✔ Config key "${key}" updated successfully.`);
    } catch (err) {
      console.error(`Failed to update config key "${key}":`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown config action: "${action}". Usage: omnimemory config [get|set]`);
  process.exit(1);
}

/**
 * Handles 'prune' manual execution.
 */
async function handlePruneCommand(): Promise<void> {
  const configManager = new ConfigManager();
  const config = configManager.getConfig();
  
  const dbService = new DBService();
  await dbService.initialize();

  const worker = new RetentionWorker(dbService, config.retentionDays);
  console.log(`Running retention cleanup (pruning records older than ${config.retentionDays} days)...`);
  const count = await worker.runCleanup();
  console.log(`✔ Cleanup complete. ${count} expired records removed.`);

  dbService.close();
}

/**
 * Main CLI Router
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const primaryCommand = args[0];

  switch (primaryCommand) {
    case 'service':
      handleServiceCommand(args[1]);
      break;

    case 'config':
      handleConfigCommand(args.slice(1));
      break;

    case 'prune':
      await handlePruneCommand();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`
OmniMemory CLI Interface

Commands:
  (no args)                     Launch interactive search prompt
  <query>                       Run hybrid search directly with query text
  service install               Install system launchd/systemd background daemon
  service uninstall             Remove installed background daemon service
  config get [key]              View active configuration or specific key
  config set <key> <val>        Update configuration key value
  prune                         Manually trigger retention worker and database vacuum
`);
      break;

    default:
      await runInteractiveSearch(primaryCommand ? args.join(' ') : undefined);
      break;
  }
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});

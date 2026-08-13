import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { removePandaDirectory } from './utils/panda-dir';
import { appendEnv } from '../commander';

/**
 * Remove PANDA configuration and .panda directory
 */
export async function runDeinitCommand(options: { force: boolean }): Promise<void> {
  console.log('\n🐼 PANDA Deinitialization');
  console.log('==========================\n');

  const pandaPath = path.join(process.cwd(), '.panda');

  // Check if .panda exists
  if (!fs.existsSync(pandaPath)) {
    console.log('No PANDA configuration found (.panda directory does not exist).');
    return;
  }

  // Warning prompt
  if (!options.force) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        '⚠️  This will permanently delete your PANDA configuration including credentials and keys metadata.\n' +
        'Are you sure you want to continue? (yes/no): ',
        resolve
      );
    });

    rl.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Deinitialization cancelled.');
      return;
    }
  }

  // Remove .panda directory
  console.log('Removing .panda directory...');
  try {
    removePandaDirectory();
    console.log('✓ .panda directory removed');
  } catch (error: any) {
    console.log(`✗ Failed to remove .panda directory: ${error.message}`);
  }

  // Clean up .env files
  console.log('\nCleaning up .env files...');

  const envPath = path.join(process.cwd(), '.env');
  const examplePath = path.join(process.cwd(), '.env.example');

  // Remove PANDA-specific entries from .env
  const pandaVars = [
    'PANDA_ACCESS_TOKEN',
    'PANDA_DEFAULT_KID',
    'PANDA_KEY_PROVIDER_DRIVER',
    'PANDA_VAULT_URL',
    'PANDA_VAULT_TOKEN',
    'PANDA_VAULT_MOUNT_PATH',
    'PANDA_INFISICAL_SITE_URL',
    'PANDA_INFISICAL_CLIENT_ID',
    'PANDA_INFISICAL_CLIENT_SECRET',
    'PANDA_INFISICAL_PROJECT_ID',
    'PANDA_INFISICAL_ENVIRONMENT',
    'PANDA_INFISICAL_CACHE_TTL'
  ];

  // Also remove any PANDA_KEY_* variables
  // This is a simplified approach - in production, you'd want to be more careful

  for (const envFile of [envPath, examplePath]) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    let content = fs.readFileSync(envFile, 'utf8');
    let modified = false;

    for (const varName of pandaVars) {
      const regex = new RegExp(`^${varName}=.*\\r?\\n?`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, '');
        modified = true;
        console.log(`  ✓ Removed ${varName} from ${path.basename(envFile)}`);
      }
    }

    // Remove PANDA_KEY_* variables
    const keyRegex = /^PANDA_KEY_.*=.*\r?\n?/gm;
    if (keyRegex.test(content)) {
      content = content.replace(keyRegex, '');
      modified = true;
      console.log(`  ✓ Removed PANDA_KEY_* variables from ${path.basename(envFile)}`);
    }

    if (modified) {
      // Clean up any extra blank lines
      content = content.replace(/\n{3,}/g, '\n\n');
      fs.writeFileSync(envFile, content.trim() + '\n', 'utf8');
    }
  }

  console.log('\n✓ PANDA deinitialization complete!');
  console.log('\nTo start fresh, run: panda init');
  console.log();
}

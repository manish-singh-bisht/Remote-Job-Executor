import { Command } from 'commander';
import { RemoteExecutor } from '../../classes/remote-executor';
import {
  SSHConnectionConfig,
  RemoteExecutionConfig,
} from '../../interfaces/remote-ssh';
import chalk from 'chalk';
import fs from 'fs';

export function registerSSHCommands(program: Command) {
  // example: npx tsx src/cli/index.ts ssh-test --host 127.0.0.1 --username user --password password --port 2222
  program
    .command('ssh-test')
    .description('Test SSH connection to remote server')
    .option('-h, --host <host>', 'Remote server hostname or IP address')
    .option('-u, --username <username>', 'SSH username')
    .option('-p, --port <port>', 'SSH port (default: 22)')
    .option(
      '--password <password>',
      'SSH password (not recommended for production)'
    )
    .option('--private-key <path>', 'Path to private key file')
    .option('--passphrase <passphrase>', 'Passphrase for private key')
    .option(
      '--timeout <timeout>',
      'Connection timeout in milliseconds (default: 20000)'
    )
    .action(async (options) => {
      console.log(chalk.bold('🔐 Testing SSH Connection...'));

      try {
        // Get values from options or environment variables
        const host = options.host || process.env.SSH_HOST;
        const username = options.username || process.env.SSH_USERNAME;
        const port = parseInt(options.port || process.env.SSH_PORT || '22');
        const timeout = parseInt(
          options.timeout || process.env.SSH_TIMEOUT || '20000'
        );
        const password = options.password || process.env.SSH_PASSWORD;
        const privateKeyPath =
          options.privateKey || process.env.SSH_PRIVATE_KEY;
        const passphrase = options.passphrase || process.env.SSH_PASSPHRASE;

        // Validate required fields
        if (!host || !username) {
          throw new Error(
            'Host and username are required. Provide them via options or environment variables (SSH_HOST, SSH_USERNAME)'
          );
        }

        console.log(chalk.dim(`Connecting to ${username}@${host}:${port}\n`));

        // Build SSH configuration
        const sshConfig: SSHConnectionConfig = {
          host,
          port,
          username,
          readyTimeout: timeout,
        };

        // Handle authentication
        if (password) {
          sshConfig.password = password;
          console.log(chalk.yellow('⚠️  Using password authentication'));
        } else if (privateKeyPath) {
          if (!fs.existsSync(privateKeyPath)) {
            throw new Error(`Private key file not found: ${privateKeyPath}`);
          }
          sshConfig.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
          if (passphrase) {
            sshConfig.passphrase = passphrase;
          }
          console.log(chalk.blue('🔑 Using private key authentication'));
        } else {
          throw new Error(
            'Either --password or --private-key must be provided (or SSH_PASSWORD/SSH_PRIVATE_KEY environment variables)'
          );
        }

        // Create remote execution config
        const config: RemoteExecutionConfig = {
          ssh: sshConfig,
        };

        // Create remote executor and test connection
        const executor = new RemoteExecutor(config);

        console.log(chalk.dim('Establishing connection...'));
        await executor.connect();

        console.log(chalk.dim('Testing connection...'));
        const isConnected = await executor.testConnection();

        if (isConnected) {
          console.log(chalk.green('✅ SSH connection test successful!'));

          // Get server info for additional verification
          try {
            const serverInfo = await executor.getServerInfo();
            console.log(chalk.dim('\n📋 Server Information:'));
            console.log(chalk.cyan(`   Hostname: ${serverInfo.hostname}`));
            console.log(chalk.cyan(`   Uptime: ${serverInfo.uptime}`));
          } catch (error) {
            console.log(
              chalk.yellow('⚠️  Could not retrieve server information')
            );
          }
        } else {
          console.log(chalk.red('❌ SSH connection test failed'));
          process.exit(1);
        }

        // Clean up connection
        await executor.disconnect();
        console.log(chalk.dim('Connection closed'));
      } catch (error) {
        console.error(
          chalk.red(`❌ SSH connection failed: ${(error as Error).message}`)
        );
        process.exit(1);
      }
    });
}

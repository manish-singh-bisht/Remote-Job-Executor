import { Command } from 'commander';
import { Queue } from '../../classes/queue';
import { Worker } from '../../classes/worker';
import { RemoteExecutionConfig } from '../../interfaces';
import chalk from 'chalk';
import * as fs from 'fs';
import 'dotenv/config';

import {
  sanitizeQueueName,
  sanitizeNumber,
  sanitizeSSHHost,
  sanitizeSSHUsername,
  sanitizeSSHKeyPath,
  sanitizeWorkingDir,
  ValidationError,
} from '../../lib/sanitization';

export function registerWorkerCommands(program: Command) {
  const workerCmd = program
    .command('worker')
    .description('Worker management commands');

  // example: npx tsx src/cli/commands/worker.ts start --queue test --ssh-host 127.0.0.1 --ssh-user root --ssh-password password --ssh-key ~/.ssh/id_rsa --ssh-passphrase passphrase --remote-workdir /tmp --concurrency 1 --poll-interval 5000 --stalled-timeout 60000
  workerCmd
    .command('start')
    .description('Start a worker for a queue')
    .requiredOption('-q, --queue <name>', 'Queue name')
    .option('-c, --concurrency <number>', 'Number of concurrent jobs', '1')
    .option('--poll-interval <ms>', 'Poll interval in milliseconds', '5000')
    .option(
      '--stalled-timeout <ms>',
      'Stalled job timeout in milliseconds',
      '60000'
    )
    .option('--ssh-host <host>', 'Remote SSH host for job execution')
    .option('--ssh-port <port>', 'SSH port', '22')
    .option('--ssh-user <username>', 'SSH username')
    .option('--ssh-password <password>', 'SSH password (if not using key)')
    .option(
      '--ssh-key <path>',
      'Path to SSH private key file (if not using password)'
    )
    .option(
      '--ssh-passphrase <passphrase>',
      'SSH key passphrase (if key is encrypted)'
    )
    .option('--remote-workdir <path>', 'Remote working directory', '/tmp')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const queueName = sanitizeQueueName(options.queue);
        const concurrency = sanitizeNumber(
          options.concurrency,
          'concurrency',
          1,
          50
        );
        const pollInterval = sanitizeNumber(
          options.pollInterval,
          'poll interval',
          1000,
          60000
        );
        const stalledTimeout = sanitizeNumber(
          options.stalledTimeout,
          'stalled timeout',
          10000,
          3600000
        );

        const sshHost = sanitizeSSHHost(
          options.sshHost || process.env.SSH_HOST
        );
        const sshPort = sanitizeNumber(
          options.sshPort || process.env.SSH_PORT || '22',
          'SSH port',
          1,
          65535
        );
        const sshUsername = sanitizeSSHUsername(
          options.sshUser || process.env.SSH_USER
        );
        const sshPassword = options.sshPassword || process.env.SSH_PASSWORD;
        const sshKeyPath = options.sshKey || process.env.SSH_KEY_PATH;
        const sshPassphrase =
          options.sshPassphrase || process.env.SSH_KEY_PASSPHRASE;
        const remoteWorkdir = sanitizeWorkingDir(
          options.remoteWorkdir || process.env.REMOTE_WORKDIR
        );

        // Ensure required fields
        if (!sshHost || !sshUsername) {
          console.error(chalk.red('✗ SSH host and SSH username are required'));
          process.exit(1);
        }

        if (!sshPassword && !sshKeyPath) {
          console.error(
            chalk.red('✗ Either SSH password or SSH key must be provided')
          );
          process.exit(1);
        }

        let privateKey: string | undefined;
        if (sshKeyPath) {
          try {
            const keyPath = sanitizeSSHKeyPath(sshKeyPath);
            privateKey = fs.readFileSync(keyPath, 'utf8');
          } catch (error) {
            console.error(chalk.red(`✗ Failed to read SSH key file: ${error}`));
            process.exit(1);
          }
        }

        const remoteConfig: RemoteExecutionConfig = {
          ssh: {
            host: sshHost,
            port: sshPort,
            username: sshUsername,
            password: sshPassword,
            privateKey,
            passphrase: sshPassphrase,
            readyTimeout: 20000,
          },
          workingDir: remoteWorkdir,
          env: {
            PATH: '/usr/local/bin:/usr/bin:/bin',
          },
        };

        const queue = new Queue(queueName);

        const worker = new Worker(
          queue,
          {
            queueName,
            workerConcurrency: concurrency,
            pollIntervalMs: pollInterval,
            stalledTimeoutMs: stalledTimeout,
          },
          remoteConfig
        );

        console.log(chalk.green(`🚀 Starting worker for queue "${queueName}"`));
        console.log(chalk.dim(`Concurrency: ${concurrency}`));
        console.log(chalk.dim(`Poll interval: ${pollInterval}ms`));
        console.log(chalk.dim(`Stalled timeout: ${stalledTimeout}ms`));
        console.log(chalk.blue(`🌐 Remote execution mode`));
        console.log(chalk.dim(`SSH Host: ${sshHost}:${sshPort}`));
        console.log(chalk.dim(`SSH User: ${sshUsername}`));
        console.log(chalk.dim(`Remote Working Dir: ${remoteWorkdir}`));

        worker.on('jobStarted', (job) => {
          console.log(chalk.blue(`▶ Started job: ${job.name} (${job.id})`));
        });

        worker.on('jobCompleted', (job) => {
          console.log(chalk.green(`✓ Completed job: ${job.name} (${job.id})`));
        });

        worker.on('jobFailed', (job, error) => {
          console.log(
            chalk.red(
              `✗ Failed job: ${job.name} (${job.id}) - ${error.message}`
            )
          );
        });

        process.on('SIGINT', async () => {
          console.log('\nGracefully shutting down worker...');
          await worker.stop();
          process.exit(0);
        });

        await worker.start();
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error starting worker: ${(error as Error).message}`)
          );
        }
        process.exit(1);
      }
    });
}

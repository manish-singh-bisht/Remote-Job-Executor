import { Command } from 'commander';
import { Queue } from '../../classes/queue';
import { Job } from '../../classes/job';
import { JobStatus } from '../../../generated/prisma';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  sanitizeQueueName,
  sanitizeJobName,
  sanitizeCommand,
  sanitizeArgs,
  sanitizeCustomId,
  sanitizeNumber,
  sanitizeWorkingDir,
  sanitizeStatus,
  sanitizeSSHHost,
  sanitizeSSHUsername,
  sanitizeSSHKeyPath,
  ValidationError,
} from '../../lib/sanitization';
import { RemoteExecutor } from '../../classes/remote-executor';
import { RemoteExecutionConfig } from '../../interfaces';
import * as fs from 'fs';
import * as path from 'path';

export function registerJobCommands(program: Command) {
  const jobCmd = program.command('job').description('Job management commands');

  // example: npx tsx src/cli/commands/job.ts add --queue test --name test --command "echo 'Hello, world!'" --args "arg1" "arg2" --custom-id "custom123" --priority 5 --max-attempts 3 --timeout 300 --working-dir /tmp --keep-logs 50
  jobCmd
    .command('add')
    .description('Add a new job to a queue')
    .requiredOption('-q, --queue <name>', 'Queue name')
    .requiredOption('-n, --name <name>', 'Job name')
    .requiredOption('-c, --command <command>', 'Command to execute')
    .option('-a, --args <args...>', 'Command arguments')
    .option('--custom-id <id>', 'Custom job ID')
    .option(
      '-p, --priority <number>',
      'Job priority (lower = higher priority)',
      '0'
    )
    .option('--max-attempts <number>', 'Maximum retry attempts', '3')
    .option('--timeout <seconds>', 'Timeout in seconds')
    .option('--working-dir <path>', 'Working directory')
    .option('--keep-logs <number>', 'Number of logs to keep', '50')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const queueName = sanitizeQueueName(options.queue);
        const jobName = sanitizeJobName(options.name);
        const command = sanitizeCommand(options.command);
        const args = options.args ? sanitizeArgs(options.args) : undefined;
        const customId = options.customId
          ? sanitizeCustomId(options.customId)
          : undefined;
        const priority = sanitizeNumber(options.priority, 'priority', 0, 1000);
        const maxAttempts = sanitizeNumber(
          options.maxAttempts,
          'max attempts',
          1,
          10
        );
        const timeout = options.timeout
          ? sanitizeNumber(options.timeout, 'timeout', 1, 86400)
          : undefined;
        const workingDir = options.workingDir
          ? sanitizeWorkingDir(options.workingDir)
          : undefined;
        const keepLogs = sanitizeNumber(options.keepLogs, 'keep logs', 1, 1000);

        const queue = new Queue(queueName);
        const jobOptions = {
          customId,
          priority,
          maxAttempts,
          timeout,
          workingDir,
          keepLogs,
        };

        const job = await queue.add(jobName, command, args, jobOptions);

        console.log(
          chalk.green(`✓ Job "${jobName}" added to queue "${queueName}"`)
        );
        console.log(chalk.dim(`Job ID: ${job.id}`));
        if (customId) {
          console.log(chalk.dim(`Custom ID: ${customId}`));
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error adding job: ${(error as Error).message}`)
          );
        }
        process.exit(1);
      }
    });

  // example: npx tsx src/cli/commands/job.ts list --queue test --status PENDING --page 1
  jobCmd
    .command('list')
    .description('List jobs in a queue')
    .requiredOption('-q, --queue <name>', 'Queue name')
    .option(
      '-s, --status <status>',
      'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, STALLED)'
    )
    .option('-p, --page <number>', 'Page number (20 items per page)', '1')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const queueName = sanitizeQueueName(options.queue);
        const status = options.status
          ? sanitizeStatus(options.status)
          : undefined;
        const page = sanitizeNumber(options.page, 'page', 1, 1000);

        const queueRecord = await Job.findQueueByName(queueName);

        if (!queueRecord) {
          console.error(chalk.red(`✗ Queue "${queueName}" not found`));
          return;
        }

        const pageSize = 20;
        const jobs = await Job.listByQueue(
          queueRecord.id,
          status as JobStatus,
          page,
          pageSize
        );

        if (jobs.length === 0) {
          console.log(chalk.yellow('No jobs found'));
          return;
        }

        const table = new Table({
          head: [
            'ID',
            'Name',
            'Custom ID',
            'Command',
            'Status',
            'Priority',
            'Attempts',
            'Created',
            'Exit Code',
          ],
          colWidths: [5, 15, 12, 25, 10, 8, 10, 12, 10],
        });

        jobs.forEach((job) => {
          const getStatusColor = (status: string) => {
            switch (status) {
              case 'PENDING':
                return chalk.blue(status);
              case 'RUNNING':
                return chalk.yellow(status);
              case 'COMPLETED':
                return chalk.green(status);
              case 'FAILED':
                return chalk.red(status);
              case 'STALLED':
                return chalk.magenta(status);
              default:
                return chalk.white(status);
            }
          };

          table.push([
            job.id,
            job.name,
            job.custom_id || '-',
            job.command.length > 22
              ? job.command.substring(0, 22) + '...'
              : job.command,
            getStatusColor(job.status),
            job.priority,
            `${job.attempts_made}/${job.max_attempts}`,
            job.created_at.toISOString().split('T')[0],
            job.exit_code ?? '-',
          ]);
        });

        console.log(table.toString());

        // Show pagination info
        const totalJobs = await Job.countByQueue(
          queueRecord.id,
          status as JobStatus
        );
        const totalPages = Math.ceil(totalJobs / pageSize);
        console.log(
          chalk.dim(`\nPage ${page} of ${totalPages} (${totalJobs} total jobs)`)
        );

        if (page < totalPages) {
          console.log(
            chalk.dim(`Run with --page ${page + 1} to see next page`)
          );
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error listing jobs: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/job.ts show --id 1
  jobCmd
    .command('show')
    .description('Show detailed information about a job')
    .option('-i, --id <id>', 'Job ID')
    .option('--custom-id <id>', 'Custom job ID')
    .option('-q, --queue <name>', 'Queue name (required with custom-id)')
    .action(async (options) => {
      try {
        let job;

        if (options.id) {
          const jobId = sanitizeNumber(options.id, 'job ID', 1);
          job = await Job.findByIdWithQueue(jobId);
        } else if (options.customId) {
          if (!options.queue) {
            console.error(
              chalk.red('✗ Queue name is required when using custom-id')
            );
            return;
          }
          const customId = sanitizeCustomId(options.customId);
          const queueName = sanitizeQueueName(options.queue);
          job = await Job.findByCustomIdWithQueue(customId, queueName);
        } else {
          console.error(
            chalk.red('✗ Either --id or --custom-id must be provided')
          );
          return;
        }

        if (!job) {
          console.error(chalk.red('✗ Job not found'));
          return;
        }

        console.log(chalk.bold(`\n📋 Job Details:`));
        console.log(`ID: ${job.id}`);
        console.log(`Custom ID: ${job.custom_id || 'None'}`);
        console.log(`Name: ${job.name}`);
        console.log(`Queue: ${job.queue.name}`);
        console.log(`Command: ${job.command}`);
        console.log(`Args: ${job.args ? JSON.stringify(job.args) : 'None'}`);
        console.log(`Working Dir: ${job.working_dir || 'None'}`);
        console.log(
          `Status: ${chalk[job.status === 'COMPLETED' ? 'green' : job.status === 'FAILED' ? 'red' : 'yellow'](job.status)}`
        );
        console.log(`Priority: ${job.priority}`);
        console.log(`Attempts: ${job.attempts_made}/${job.max_attempts}`);
        console.log(`Timeout: ${job.timeout ? `${job.timeout}s` : 'None'}`);
        console.log(`Created: ${job.created_at.toISOString()}`);
        console.log(
          `Processed: ${job.processed_on ? job.processed_on.toISOString() : 'Not yet'}`
        );
        console.log(
          `Finished: ${job.finished_on ? job.finished_on.toISOString() : 'Not yet'}`
        );
        console.log(`Exit Code: ${job.exit_code ?? 'None'}`);

        if (job.failed_reason) {
          console.log(`\n${chalk.red('Error:')} ${job.failed_reason}`);
        }

        if (job.std_out) {
          console.log(`\n${chalk.green('STDOUT:')}\n${job.std_out}`);
        }

        if (job.std_err) {
          console.log(`\n${chalk.red('STDERR:')}\n${job.std_err}`);
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error showing job: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/job.ts logs --id 1 --follow
  jobCmd
    .command('logs')
    .description('Show job logs')
    .option('-i, --id <id>', 'Job ID')
    .option('--custom-id <id>', 'Custom job ID')
    .option('-q, --queue <name>', 'Queue name (required with custom-id)')
    .option('-l, --limit <number>', 'Limit number of log entries', '50')
    .option('-f, --follow', 'Follow logs (live tail)')
    .action(async (options) => {
      try {
        let jobId;

        if (options.id) {
          jobId = sanitizeNumber(options.id, 'job ID', 1);
        } else if (options.customId) {
          if (!options.queue) {
            console.error(
              chalk.red('✗ Queue name is required when using custom-id')
            );
            return;
          }
          const customId = sanitizeCustomId(options.customId);
          const queueName = sanitizeQueueName(options.queue);
          const job = await Job.findByCustomId(customId, queueName);
          if (!job) {
            console.error(chalk.red('✗ Job not found'));
            return;
          }
          jobId = job.id;
        } else {
          console.error(
            chalk.red('✗ Either --id or --custom-id must be provided')
          );
          return;
        }

        const limit = sanitizeNumber(options.limit, 'limit', 1, 1000);
        const jobInstance = new Job('', '', 0);
        jobInstance.id = jobId;

        if (options.follow) {
          console.log(chalk.dim('Following logs... (Press Ctrl+C to exit)'));
          let lastSequence = 0;
          let isFirstTime = true;

          const showLogs = async () => {
            const logs = await jobInstance.getLogs(100);

            if (isFirstTime) {
              // First time: show all existing logs
              logs.forEach((log) => {
                console.log(`[${log.created_at.toISOString()}] ${log.message}`);
              });
              if (logs.length > 0) {
                lastSequence = Math.max(...logs.map((log) => log.sequence));
              }
              isFirstTime = false;
            } else {
              // Subsequent times: only show new logs (append mode)
              const newLogs = logs.filter((log) => log.sequence > lastSequence);

              newLogs.forEach((log) => {
                console.log(`[${log.created_at.toISOString()}] ${log.message}`);
                lastSequence = Math.max(lastSequence, log.sequence);
              });
            }
          };

          // Show initial logs
          await showLogs();

          // Poll for new logs
          const interval = setInterval(showLogs, 4000);

          process.on('SIGINT', () => {
            clearInterval(interval);
            console.log('\nStopped following logs');
            process.exit(0);
          });
        } else {
          const logs = await jobInstance.getLogs(limit);

          if (logs.length === 0) {
            console.log(chalk.yellow('No logs found'));
            return;
          }

          logs.forEach((log) => {
            console.log(`[${log.created_at.toISOString()}] ${log.message}`);
          });
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error showing logs: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/job.ts retry --id 1
  jobCmd
    .command('retry')
    .description('Retry a failed job')
    .option('-i, --id <id>', 'Job ID')
    .option('--custom-id <id>', 'Custom job ID')
    .option('-q, --queue <name>', 'Queue name (required with custom-id)')
    .action(async (options) => {
      try {
        let jobId;

        if (options.id) {
          jobId = sanitizeNumber(options.id, 'job ID', 1);
        } else if (options.customId) {
          if (!options.queue) {
            console.error(
              chalk.red('✗ Queue name is required when using custom-id')
            );
            return;
          }
          const customId = sanitizeCustomId(options.customId);
          const queueName = sanitizeQueueName(options.queue);
          const job = await Job.findByCustomId(customId, queueName);
          if (!job) {
            console.error(chalk.red('✗ Job not found'));
            return;
          }
          jobId = job.id;
        } else {
          console.error(
            chalk.red('✗ Either --id or --custom-id must be provided')
          );
          return;
        }

        await Job.retry(jobId);

        console.log(
          chalk.green(`✓ Job ${jobId} has been reset to PENDING for retry`)
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error retrying job: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/job.ts upload-script --script ./backup.sh --remote-dir /scripts --ssh-host 127.0.0.1 --ssh-user root --ssh-password password --make-executable
  jobCmd
    .command('upload-script')
    .description('Upload a script file and optionally make it executable')
    .requiredOption('--script <path>', 'Local script file path')
    .option('--remote-dir <path>', 'Remote directory (defaults to /tmp)')
    .option(
      '--remote-name <name>',
      'Remote filename (defaults to original name)'
    )
    .option('--make-executable', 'Make the script executable after upload')
    .requiredOption('--ssh-host <host>', 'Remote SSH host')
    .option('--ssh-port <port>', 'SSH port', '22')
    .requiredOption('--ssh-user <username>', 'SSH username')
    .option('--ssh-password <password>', 'SSH password (if not using key)')
    .option('--ssh-key <path>', 'Path to SSH private key file')
    .option('--ssh-passphrase <passphrase>', 'SSH key passphrase')
    .action(async (options) => {
      try {
        // Validate script file exists
        if (!fs.existsSync(options.script)) {
          console.error(
            chalk.red(`✗ Script file not found: ${options.script}`)
          );
          process.exit(1);
        }

        // Validate SSH configuration
        if (!options.sshPassword && !options.sshKey) {
          console.error(
            chalk.red('✗ Either SSH password or SSH key must be provided')
          );
          process.exit(1);
        }

        // Sanitize inputs
        const sshHost = sanitizeSSHHost(options.sshHost);
        const sshPort = sanitizeNumber(options.sshPort, 'SSH port', 1, 65535);
        const sshUsername = sanitizeSSHUsername(options.sshUser);

        // Build remote path
        const scriptName = options.remoteName || path.basename(options.script);
        const remoteDir = options.remoteDir || '/tmp';
        const remotePath = path.posix.join(remoteDir, scriptName);

        // Read private key if provided
        let privateKey: string | undefined;
        if (options.sshKey) {
          try {
            const keyPath = sanitizeSSHKeyPath(options.sshKey);
            privateKey = fs.readFileSync(keyPath, 'utf8');
          } catch (error) {
            console.error(chalk.red(`✗ Failed to read SSH key file: ${error}`));
            process.exit(1);
          }
        }

        // Build remote configuration
        const remoteConfig: RemoteExecutionConfig = {
          ssh: {
            host: sshHost,
            port: sshPort,
            username: sshUsername,
            password: options.sshPassword,
            privateKey: privateKey,
            passphrase: options.sshPassphrase,
            readyTimeout: 20000,
          },
        };

        const remoteExecutor = new RemoteExecutor(remoteConfig);

        console.log(chalk.blue(`📜 Uploading script to ${sshHost}...`));

        await remoteExecutor.connect();
        await remoteExecutor.uploadFile(options.script, remotePath);

        // Make executable if requested
        if (options.makeExecutable) {
          console.log(chalk.blue(`🔧 Making script executable...`));
          const chmodResult = await remoteExecutor['ssh'].execCommand(
            `chmod +x "${remotePath}"`
          );
          if (chmodResult.code !== 0) {
            console.warn(
              chalk.yellow(
                `⚠ Warning: Failed to make script executable: ${chmodResult.stderr}`
              )
            );
          }
        }

        await remoteExecutor.disconnect();

        console.log(chalk.green(`✓ Script uploaded successfully`));
        console.log(chalk.dim(`Local: ${options.script}`));
        console.log(chalk.dim(`Remote: ${remotePath}`));
        if (options.makeExecutable) {
          console.log(chalk.dim(`Permissions: executable`));
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error uploading script: ${(error as Error).message}`)
          );
        }
        process.exit(1);
      }
    });
}

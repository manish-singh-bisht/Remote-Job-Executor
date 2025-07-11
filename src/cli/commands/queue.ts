import 'dotenv/config';
import { Command } from 'commander';
import { Queue } from '../../classes/queue';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  sanitizeQueueName,
  sanitizeNumber,
  sanitizeWorkingDir,
  ValidationError,
} from '../../lib/sanitization';

export function registerQueueCommands(program: Command) {
  const queueCmd = program
    .command('queue')
    .description('Queue management commands');

  // example: npx tsx src/cli/commands/queue.ts create --name test --max-attempts 3 --timeout 300 --working-dir /tmp --keep-logs 50
  queueCmd
    .command('create')
    .description('Create a new queue')
    .requiredOption('-n, --name <name>', 'Queue name')
    .option('--max-attempts <number>', 'Default max attempts for jobs', '1')
    .option('--timeout <seconds>', 'Default timeout for jobs in seconds')
    .option('--working-dir <path>', 'Default working directory')
    .option('--keep-logs <number>', 'Number of logs to keep per job', '50')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const queueName = sanitizeQueueName(options.name);
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

        const defaultJobOptions = {
          maxAttempts,
          timeout,
          workingDir,
          keepLogs,
        };

        const queue = new Queue(queueName, { defaultJobOptions });

        await queue.createQueue();

        console.log(chalk.green(`✓ Queue "${queueName}" created successfully`));
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error creating queue: ${(error as Error).message}`)
          );
        }
        process.exit(1);
      }
    });

  // example: npx tsx src/cli/commands/queue.ts list --page 1
  queueCmd
    .command('list')
    .description('List all queues')
    .option('-p, --page <number>', 'Page number (20 items per page)', '1')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const page = sanitizeNumber(options.page, 'page', 1, 1000);
        const pageSize = 20;

        const queues = await Queue.listQueues(page, pageSize);

        if (queues.length === 0) {
          console.log(chalk.yellow('No queues found'));
          return;
        }

        const table = new Table({
          head: ['ID', 'Name', 'Status', 'Jobs', 'Created At'],
          colWidths: [5, 20, 10, 8, 20],
        });

        queues.forEach((queue) => {
          table.push([
            queue.id,
            queue.name,
            queue.status === 'ACTIVE'
              ? chalk.green('ACTIVE')
              : chalk.red('PAUSED'),
            queue._count.jobs,
            queue.created_at.toISOString().split('T')[0],
          ]);
        });

        console.log(table.toString());

        // Show pagination info
        const totalQueues = await Queue.countQueues();
        const totalPages = Math.ceil(totalQueues / pageSize);
        console.log(
          chalk.dim(
            `\nPage ${page} of ${totalPages} (${totalQueues} total queues)`
          )
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
            chalk.red(`✗ Error listing queues: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/queue.ts pause --name test
  queueCmd
    .command('pause')
    .description('Pause a queue')
    .requiredOption('-n, --name <name>', 'Queue name')
    .action(async (options) => {
      try {
        const queueName = sanitizeQueueName(options.name);
        const queue = new Queue(queueName);
        await queue.pause();
        console.log(chalk.yellow(`⏸ Queue "${queueName}" paused`));
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error pausing queue: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/queue.ts resume --name test
  queueCmd
    .command('resume')
    .description('Resume a paused queue')
    .requiredOption('-n, --name <name>', 'Queue name')
    .action(async (options) => {
      try {
        const queueName = sanitizeQueueName(options.name);
        const queue = new Queue(queueName);
        await queue.resume();
        console.log(chalk.green(`▶ Queue "${queueName}" resumed`));
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error resuming queue: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/queue.ts stats --name test
  queueCmd
    .command('stats')
    .description('Show queue statistics')
    .requiredOption('-n, --name <name>', 'Queue name')
    .action(async (options) => {
      try {
        const queueName = sanitizeQueueName(options.name);
        const queue = new Queue(queueName);
        const stats = await queue.getStats();

        console.log(chalk.bold(`\n📊 Queue "${queueName}" Statistics:`));
        console.log(`Total Jobs: ${chalk.cyan(stats.totalJobs)}`);
        console.log(`Pending: ${chalk.blue(stats.pendingJobs)}`);
        console.log(`Running: ${chalk.yellow(stats.runningJobs)}`);
        console.log(`Completed: ${chalk.green(stats.completedJobs)}`);
        console.log(`Failed: ${chalk.red(stats.failedJobs)}`);
        console.log(`Stalled: ${chalk.magenta(stats.stalledJobs)}`);
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(
              `✗ Error getting queue stats: ${(error as Error).message}`
            )
          );
        }
      }
    });
}

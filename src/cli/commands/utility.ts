import { Command } from 'commander';
import { Queue } from '../../classes/queue';
import prisma from '../../lib/prisma';
import chalk from 'chalk';
import Table from 'cli-table3';
import { ValidationError } from '../../lib/sanitization';

export function registerUtilityCommands(program: Command) {
  // example: npx tsx src/cli/commands/utility.ts dashboard
  program
    .command('dashboard')
    .description('Show a live dashboard of all queues')
    .action(async () => {
      console.log(chalk.bold('📊 Job Queue Dashboard'));
      console.log(chalk.dim('Press Ctrl+C to exit\n'));

      const showDashboard = async () => {
        console.clear();
        console.log(chalk.bold('📊 Job Queue Dashboard'));
        console.log(chalk.dim('Press Ctrl+C to exit\n'));

        try {
          const queues = await prisma.queue.findMany({
            select: {
              name: true,
              status: true,
              _count: {
                select: {
                  jobs: {
                    where: { status: 'PENDING' },
                  },
                },
              },
            },
          });

          const table = new Table({
            head: ['Queue', 'Status', 'Pending Jobs'],
            colWidths: [20, 10, 15],
          });

          for (const queue of queues) {
            const queueInstance = new Queue(queue.name);
            const stats = await queueInstance.getStats();

            table.push([
              queue.name,
              queue.status === 'ACTIVE'
                ? chalk.green('ACTIVE')
                : chalk.red('PAUSED'),
              `P:${stats.pendingJobs} R:${stats.runningJobs} C:${stats.completedJobs} F:${stats.failedJobs}`,
            ]);
          }

          console.log(table.toString());
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error(chalk.red(`✗ Validation Error: ${error.message}`));
          } else {
            console.error(chalk.red(`Error: ${(error as Error).message}`));
          }
        }
      };

      await showDashboard();
      const interval = setInterval(showDashboard, 3000);

      process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('\nDashboard closed');
        process.exit(0);
      });
    });
}

import 'dotenv/config';
import { Command } from 'commander';
import { MetricCollector } from '../../classes/metric';
import chalk from 'chalk';
import Table from 'cli-table3';
import { sanitizeNumber, ValidationError } from '../../lib/sanitization';

export function registerMetricCommands(program: Command) {
  const metricCmd = program
    .command('metric')
    .description('System metrics management commands');

  // example: npx tsx src/cli/commands/metric.ts show --limit 20
  metricCmd
    .command('show')
    .description('Show recent system metrics')
    .option('-l, --limit <number>', 'Number of recent metrics to show', '10')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const limit = sanitizeNumber(options.limit, 'limit', 1, 1000);

        const metricCollector = new MetricCollector();
        const metrics = await metricCollector.getRecentMetrics(limit);

        if (metrics.length === 0) {
          console.log(chalk.yellow('No metrics found'));
          return;
        }

        const table = new Table({
          head: ['Timestamp', 'RAM (MB)', 'CPU (%)', 'Uptime (s)'],
          colWidths: [20, 12, 10, 12],
        });

        metrics.forEach((metric) => {
          table.push([
            new Date(metric.timestamp)
              .toISOString()
              .replace('T', ' ')
              .slice(0, 19),
            metric.ram_usage_mb,
            metric.cpu_usage_percent,
            metric.uptime_seconds,
          ]);
        });

        console.log(chalk.bold('\n📊 System Metrics:'));
        console.log(table.toString());

        // Show current averages
        const avgRam = Math.round(
          metrics.reduce((sum, m) => sum + m.ram_usage_mb, 0) / metrics.length
        );
        const avgCpu =
          Math.round(
            (metrics.reduce((sum, m) => sum + m.cpu_usage_percent, 0) /
              metrics.length) *
              10
          ) / 10;

        console.log(chalk.dim(`\nAverages over ${metrics.length} samples:`));
        console.log(chalk.dim(`RAM: ${avgRam} MB, CPU: ${avgCpu}%`));
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(`✗ Error showing metrics: ${(error as Error).message}`)
          );
        }
      }
    });

  // example: npx tsx src/cli/commands/metric.ts collect --interval 30
  metricCmd
    .command('collect')
    .description('Start collecting metrics continuously')
    .option('-i, --interval <seconds>', 'Collection interval in seconds', '60')
    .action(async (options) => {
      try {
        // Sanitize and validate inputs
        const interval = sanitizeNumber(options.interval, 'interval', 10, 3600);

        const metricCollector = new MetricCollector();

        console.log(
          chalk.green(`🚀 Starting metric collection every ${interval} seconds`)
        );
        console.log(chalk.dim('Press Ctrl+C to stop collection'));

        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\n⏹ Stopping metric collection...'));
          process.exit(0);
        });

        metricCollector.start();
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`✗ Validation Error: ${error.message}`));
        } else {
          console.error(
            chalk.red(
              `✗ Error starting metric collection: ${(error as Error).message}`
            )
          );
        }
        process.exit(1);
      }
    });
}

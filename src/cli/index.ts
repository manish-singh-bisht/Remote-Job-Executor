#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { registerQueueCommands } from './commands/queue';
import { registerJobCommands } from './commands/job';
import { registerWorkerCommands } from './commands/worker';
import { registerMetricCommands } from './commands/metric';
import { registerSSHCommands } from './commands/ssh';
import chalk from 'chalk';

const program = new Command();

program
  .name('rje')
  .description('Remote Job Executor - A job queue management system with CLI');

registerQueueCommands(program);
registerJobCommands(program);
registerWorkerCommands(program);
registerMetricCommands(program);
registerSSHCommands(program);

program.on('error', (error) => {
  console.error(chalk.red(`✗ Error: ${(error as Error).message}`));
  process.exit(1);
});

program
  .parseAsync()
  .then(() => {
    // Force exit after command completes
    process.exit(0);
  })
  .catch((error) => {
    console.error(chalk.red(`✗ Error: ${(error as Error).message}`));
    process.exit(1);
  });

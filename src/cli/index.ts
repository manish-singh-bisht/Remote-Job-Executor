#!/usr/bin/env node

import { Command } from 'commander';
import { registerQueueCommands } from './commands/queue';
import { registerJobCommands } from './commands/job';
import { registerWorkerCommands } from './commands/worker';
import { registerUtilityCommands } from './commands/utility';
import { registerMetricCommands } from './commands/metric';

const program = new Command();

program.name('job-queue').description('A job queue management CLI');

registerQueueCommands(program);
registerJobCommands(program);
registerWorkerCommands(program);
registerUtilityCommands(program);
registerMetricCommands(program);

program.parse();

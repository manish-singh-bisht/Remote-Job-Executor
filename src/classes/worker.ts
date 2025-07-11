import 'dotenv/config';
import { EventEmitter } from 'events';
import prisma from '../lib/prisma';
import { JobStatus } from '../../generated/prisma';
import { Job } from './job';
import { WorkerOptions } from '../interfaces';
import { getPgClient } from '../lib/pg';
import { Client, Notification } from 'pg';
import { Queue } from './queue';
import { RemoteExecutor } from './remote-executor';
import { RemoteExecutionConfig } from '../interfaces';

export class Worker extends EventEmitter {
  private running = false;
  private concurrency: number;
  private pollIntervalMs: number;
  private stalledTimeoutMs: number;
  private activeJobs = new Set<number>();
  private pgClient: Client | null = null;
  private queue: Queue;
  private wakeUpResolve: (() => void) | null = null;
  private remoteExecutor: RemoteExecutor;

  constructor(
    queue: Queue,
    options: WorkerOptions,
    remoteConfig: RemoteExecutionConfig
  ) {
    super();
    this.concurrency = options.workerConcurrency ?? 1;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.stalledTimeoutMs = options.stalledTimeoutMs ?? 60000;
    this.queue = queue;

    this.remoteExecutor = new RemoteExecutor(remoteConfig);
  }

  async start() {
    try {
      await this.remoteExecutor.connect();

      const isConnected = await this.remoteExecutor.testConnection();
      if (!isConnected) {
        throw new Error('Remote connection test failed');
      }

      // Log server info
      const serverInfo = await this.remoteExecutor.getServerInfo();
      console.log(
        `Remote server: ${serverInfo.hostname}, Uptime: ${serverInfo.uptime}`
      );
    } catch (error) {
      console.error('Failed to connect to remote server:', error);
      throw error;
    }

    this.pgClient = await getPgClient();
    await this.pgClient.query(`LISTEN new_job`);

    this.pgClient.on('notification', (msg: Notification) => {
      if (msg.channel === 'new_job' && this.wakeUpResolve) {
        this.wakeUpResolve();
      }
    });

    await this.queue.retryStalledJobs();

    this.running = true;

    while (this.running) {
      try {
        await this.checkStalledJobs();
        await this.fillConcurrency();

        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.pollIntervalMs);
          this.wakeUpResolve = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      } catch (err) {
        console.error('Worker loop error:', err);
      } finally {
        this.wakeUpResolve = null;
      }
    }
  }

  async stop() {
    this.running = false;

    // Disconnect from remote server
    await this.remoteExecutor.disconnect();
    console.log('Disconnected from remote server');
  }

  private async fillConcurrency() {
    const slotsToFill = this.concurrency - this.activeJobs.size;
    if (slotsToFill <= 0) return;

    const jobs = await this.fetchAndLockNextJobs(slotsToFill);
    for (const job of jobs) {
      this.activeJobs.add(job.id!);
      this.processJob(job)
        .catch(console.error)
        .finally(() => this.activeJobs.delete(job.id!));
    }
  }

  private async fetchAndLockNextJobs(slotsToFill: number): Promise<Job[]> {
    // TODO: use uuidv4
    const lockToken = `${process.pid}-${Date.now()}-${Math.random()}`;

    const result = await prisma.$queryRawUnsafe<any>(
      `
      WITH next_job AS (
        SELECT id FROM job
        WHERE status = $1::"JobStatus"
          AND queue_id = (SELECT id FROM queue WHERE name = $2)
          AND lock_token IS NULL
        ORDER BY priority ASC, created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $3
      )
      UPDATE job
      SET status = $4::"JobStatus",
          lock_token = $5,
          processed_on = NOW(),
          attempts_made = attempts_made + 1
      WHERE id IN (SELECT id FROM next_job)
      RETURNING *
      `,
      'PENDING',
      this.queue.name,
      slotsToFill,
      'RUNNING',
      lockToken
    );
    if (!result || result.length === 0) return [];

    return result.map((jobData: any) => {
      const job = new Job(
        jobData.name,
        jobData.command,
        jobData.queue_id,
        jobData.args,
        {
          customId: jobData.custom_id,
          priority: jobData.priority,
          maxAttempts: jobData.max_attempts,
          timeout: jobData.timeout,
          workingDir: jobData.working_dir,
          keepLogs: jobData.keep_logs,
        }
      );

      job.id = jobData.id;
      job.status = jobData.status;
      job.attemptsMade = jobData.attempts_made;
      job.createdAt = jobData.created_at;
      job.updatedAt = jobData.updated_at;
      job.processedOn = jobData.processed_on;
      job.finishedOn = jobData.finished_on;
      job.failedReason = jobData.failed_reason;
      job.stackTrace = jobData.stack_trace;
      job.lockToken = jobData.lock_token;
      job.stdOut = jobData.std_out;
      job.stdErr = jobData.std_err;
      job.exitCode = jobData.exit_code;

      return job;
    });
  }

  private async processJob(job: Job) {
    try {
      this.emit('jobStarted', job);

      const result = await this.executeJob(job);

      // If exit code is not 0, treat as failure but still capture stdout/stderr
      if (result.exitCode !== 0) {
        const error = new Error(`Job failed with exit code ${result.exitCode}`);
        await job.moveToFailed(
          error,
          result.exitCode,
          result.stdout,
          result.stderr
        );
        this.emit('jobFailed', job, error);

        return;
      } else {
        await job.moveToCompleted(
          result.exitCode,
          result.stdout,
          result.stderr
        );
        this.emit('jobCompleted', job);

        return;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Try to get any partial results from the execution
      await job.moveToFailed(error);

      this.emit('jobFailed', job, error);
    }
  }

  private async executeJob(
    job: Job
  ): Promise<{ exitCode: number; stdout?: string; stderr?: string }> {
    try {
      const result = await this.remoteExecutor.executeJobWithTimeout(job);
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      // For timeout or connection errors, we still want to capture any partial output
      // but we need to throw the error to be handled by processJob
      throw new Error(`Remote execution failed: ${error}`);
    }
  }

  // TODO: use a heart beat system for checking stalled jobs. Right now we use time for this but for long running jobs this is not a good solution.
  private async checkStalledJobs() {
    await this.queue.markStalledJobs(this.stalledTimeoutMs);
  }
}

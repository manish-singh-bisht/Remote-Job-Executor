import 'dotenv/config';
import { JobStatus, Prisma } from '../../generated/prisma';
import { JobExecutionContext, JobOptions } from '../interfaces';
import { getPgClient } from '../lib/pg';
import prisma from '../lib/prisma';

export class Job {
  public id?: number;
  public customId?: string;
  public name: string;
  public command: string;
  public args?: string[];
  public workingDir?: string;
  public timeout?: number;

  public status: JobStatus = JobStatus.PENDING;
  public priority: number = 0;
  public stdOut?: string;
  public stdErr?: string;
  public exitCode?: number;

  public maxAttempts: number = 1;
  public attemptsMade: number = 0;

  public createdAt?: Date;
  public updatedAt?: Date;
  public processedOn?: Date;
  public finishedOn?: Date;

  public failedReason?: string;
  public stackTrace?: string;
  public lockToken?: string | null;
  public keepLogs: number = 50;

  public queueId: number;

  constructor(
    name: string,
    command: string,
    queueId: number,
    args?: string[],
    options?: JobOptions
  ) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.customId = options?.customId;
    this.priority = options?.priority ?? 0;
    this.maxAttempts = options?.maxAttempts ?? 1;
    this.timeout = options?.timeout;
    this.workingDir = options?.workingDir;
    this.keepLogs = options?.keepLogs ?? 50;
    this.queueId = queueId;
  }

  /**
   * @description This is a function to create a job.
   * @param name The name of the job.
   * @param command The command to run.
   * @param queueId The id of the queue.
   * @param args The arguments to pass to the command.
   * @param options The options for the job.
   * @param transaction The transaction to use.
   * @returns The job.
   */
  static async create(
    name: string,
    command: string,
    queueId: number,
    args?: string[],
    options?: JobOptions,
    transaction?: Prisma.TransactionClient
  ): Promise<Job> {
    try {
      const job = new Job(name, command, queueId, args, options);
      await job.save(transaction);
      await job.notifyNewJob();
      return job;
    } catch (error) {
      throw new Error(
        `Error creating job ${name} in queue ${queueId}: ${error}`
      );
    }
  }

  /**
   * @description This is a function to notify the new job.
   */
  private async notifyNewJob(): Promise<void> {
    const pgClient = await getPgClient();
    await pgClient.query(`SELECT pg_notify('new_job', $1)`, [this.name]);
  }

  /**
   * @description This is a function to save the job.
   * @param transaction The transaction to use.
   */
  async save(transaction?: Prisma.TransactionClient): Promise<void> {
    try {
      const jobData = {
        custom_id: this.customId,
        name: this.name,
        command: this.command,
        args: this.args,
        working_dir: this.workingDir,
        timeout: this.timeout,
        status: this.status,
        priority: this.priority,
        std_out: this.stdOut,
        std_err: this.stdErr,
        exit_code: this.exitCode,
        max_attempts: this.maxAttempts,
        attempts_made: this.attemptsMade,
        processed_on: this.processedOn,
        finished_on: this.finishedOn,
        failed_reason: this.failedReason,
        stack_trace: this.stackTrace,
        lock_token: this.lockToken,
        keep_logs: this.keepLogs,
        queue: { connect: { id: this.queueId } },
      } satisfies Prisma.JobCreateInput;

      const db = transaction ?? prisma;

      if (this.id) {
        const updated = await db.job.update({
          where: { id: this.id },
          data: jobData,
        });
        this.updatedAt = updated.updated_at;
      } else {
        const created = await db.job.create({
          data: jobData,
        });
        this.id = created.id;
        this.createdAt = created.created_at;
        this.updatedAt = created.updated_at;
      }
    } catch (error) {
      throw new Error(
        `Error saving job ${this.name} in queue ${this.queueId}: ${error}`
      );
    }
  }

  /**
   * @description This is a function to move the job to running.
   * @param lockToken The lock token to use.
   */
  async moveToRunning(lockToken: string): Promise<void> {
    if (!this.id) throw new Error('Job ID is required');

    try {
      await prisma.$transaction(async (tx) => {
        const job = await tx.$queryRawUnsafe<any>(
          `SELECT * FROM job WHERE id = $1 FOR UPDATE`,
          this.id
        );

        if (!job) throw new Error(`Job ${this.id} not found for locking`);

        this.status = JobStatus.RUNNING;
        this.lockToken = lockToken;
        this.processedOn = new Date();
        this.attemptsMade += 1; // TODO: this is not atomic without the row level lock. Beaware of this.

        await this.save(tx);
      });
    } catch (error) {
      throw new Error(`Error moving job ${this.name} to running: ${error}`);
    }
  }

  /**
   * @description This is a function to move the job to completed.
   * @param exitCode The exit code of the job.
   * @param stdOut The standard output of the job.
   * @param stdErr The standard error of the job.
   */
  async moveToCompleted(
    exitCode: number = 0,
    stdOut?: string,
    stdErr?: string
  ): Promise<void> {
    if (!this.id) throw new Error('Job ID is required');
    try {
      await prisma.$transaction(async (tx) => {
        const job = await tx.$queryRawUnsafe<any>(
          `SELECT * FROM job WHERE id = $1 FOR UPDATE`,
          this.id
        );

        if (!job) throw new Error(`Job ${this.id} not found for locking`);

        this.status = JobStatus.COMPLETED;
        this.exitCode = exitCode;
        this.finishedOn = new Date();
        this.lockToken = null;
        this.stdOut = stdOut;
        this.stdErr = stdErr;
        await this.save(tx);
      });
    } catch (error) {
      throw new Error(`Error moving job ${this.name} to completed: ${error}`);
    }
  }

  /**
   * @description This is a function to move the job to failed.
   * @param error The error to use.
   * @param exitCode The exit code of the job.
   * @param stdOut The standard output of the job.
   * @param stdErr The standard error of the job.
   */
  async moveToFailed(
    error: Error,
    exitCode?: number,
    stdOut?: string,
    stdErr?: string
  ): Promise<void> {
    if (!this.id) throw new Error('Job ID is required');
    try {
      await prisma.$transaction(async (tx) => {
        const job = await tx.$queryRawUnsafe<any>(
          `SELECT * FROM job WHERE id = $1 FOR UPDATE`,
          this.id
        );

        if (!job) throw new Error(`Job ${this.id} not found for locking`);

        this.failedReason = error.message ?? error.toString();
        this.stackTrace = error.stack ?? error.toString();
        this.exitCode = exitCode;
        this.lockToken = null;
        this.stdOut = stdOut;
        this.stdErr = stdErr;
        this.processedOn = new Date();
        this.finishedOn = new Date();

        if (this.shouldRetry()) {
          this.status = JobStatus.PENDING;
          this.finishedOn = undefined;
          this.lockToken = null;
          this.processedOn = undefined;
          this.failedReason = undefined;
          this.stackTrace = undefined;

          await this.save(tx);

          // Immediately notify workers about the retry,which are treated as new jobs.
          await this.notifyNewJob();
        } else {
          this.status = JobStatus.FAILED;
          await this.save(tx);
        }
      });
    } catch (error) {
      throw new Error(`Error moving job ${this.name} to failed: ${error}`);
    }
  }

  /**
   * @description This is a function to check if the job should be retried.
   * @returns True if the job should be retried, false otherwise.
   */
  private shouldRetry(): boolean {
    return this.attemptsMade < this.maxAttempts;
  }

  /**
   * @description This is a function to add a log to the job.
   * @param message The message to add.
   */
  async addLog(message: string): Promise<void> {
    if (!this.id) return;

    try {
      await prisma.$transaction(async (tx) => {
        // Lock the Job row to serialize log writes
        await tx.$queryRawUnsafe(
          `
          SELECT id FROM "job"
          WHERE id = $1
          FOR UPDATE
        `,
          this.id
        );

        const lastLog = await tx.$queryRawUnsafe<any>(
          `
          SELECT * FROM "job_log"
          WHERE "job_id" = $1
          ORDER BY "sequence" DESC
          LIMIT 1
          `,
          this.id
        );

        const sequence = lastLog.length > 0 ? lastLog[0].sequence + 1 : 1;

        await tx.jobLog.create({
          data: {
            job_id: this.id!,
            message,
            sequence,
          },
        });

        await this.cleanOldLogs(tx);
      });
    } catch (error) {
      throw new Error(`Error adding log to job ${this.name}: ${error}`);
    }
  }

  /**
   * @description This is a function to get the execution context of the job.
   * @returns The execution context.
   */
  getExecutionContext(): JobExecutionContext {
    return {
      command: this.command,
      args: this.args,
      workingDir: this.workingDir,
      timeout: this.timeout,
    };
  }

  /**
   * @description This is a function to clean the old logs.
   * @param transaction The transaction to use.
   */
  private async cleanOldLogs(
    transaction?: Prisma.TransactionClient
  ): Promise<void> {
    if (!this.id || !this.keepLogs) return;

    const db = transaction ?? prisma;

    try {
      const logs = await db.jobLog.findMany({
        where: { job_id: this.id },
        orderBy: { sequence: 'desc' },
        skip: this.keepLogs,
      });

      // remove any logs that are older than the keepLogs limit.
      if (logs.length > 0) {
        await db.jobLog.deleteMany({
          where: {
            job_id: this.id,
            sequence: { in: logs.map((log) => log.sequence) },
          },
        });
      }
    } catch (error) {
      throw new Error(`Error cleaning old logs of job ${this.name}: ${error}`);
    }
  }

  /**
   * @description This is a function to get the logs of the job.
   * @param limit The limit of logs to get.
   * @returns The logs.
   */
  async getLogs(limit?: number) {
    if (!this.id) return [];

    try {
      const logs = await prisma.jobLog.findMany({
        where: { job_id: this.id },
        orderBy: { sequence: 'asc' },
        take: limit,
        select: {
          message: true,
          sequence: true,
          created_at: true,
        },
      });

      return logs;
    } catch (error) {
      throw new Error(`Error getting logs of job ${this.name}: ${error}`);
    }
  }

  /**
   * @description Static method to find a job by ID with queue information.
   * @param id The job ID.
   * @returns The job with queue information or null.
   */
  static async findByIdWithQueue(id: number) {
    try {
      return await prisma.job.findUnique({
        where: { id },
        include: { queue: true },
      });
    } catch (error) {
      throw new Error(`Error finding job ${id} with queue: ${error}`);
    }
  }

  /**
   * @description Static method to find a job by custom ID and queue name.
   * @param customId The custom ID of the job.
   * @param queueName The name of the queue.
   * @returns The job or null.
   */
  static async findByCustomId(customId: string, queueName: string) {
    try {
      return await prisma.job.findFirst({
        where: {
          custom_id: customId,
          queue: { name: queueName },
        },
      });
    } catch (error) {
      throw new Error(
        `Error finding job ${customId} in queue ${queueName}: ${error}`
      );
    }
  }

  /**
   * @description Static method to find a job by custom ID and queue name with queue information.
   * @param customId The custom ID of the job.
   * @param queueName The name of the queue.
   * @returns The job with queue information or null.
   */
  static async findByCustomIdWithQueue(customId: string, queueName: string) {
    try {
      return await prisma.job.findFirst({
        where: {
          custom_id: customId,
          queue: { name: queueName },
        },
        include: { queue: true },
      });
    } catch (error) {
      throw new Error(
        `Error finding job ${customId} in queue ${queueName} with queue information: ${error}`
      );
    }
  }

  /**
   * @description Static method to list jobs in a queue with filtering and pagination.
   * @param queueId The queue ID.
   * @param status Optional status filter.
   * @param page Page number (1-based).
   * @param pageSize Number of items per page.
   * @returns Array of jobs.
   */
  static async listByQueue(
    queueId: number,
    status?: JobStatus,
    page: number = 1,
    pageSize: number = 20
  ) {
    try {
      const whereClause: Prisma.JobWhereInput = { queue_id: queueId };
      if (status) {
        whereClause.status = status;
      }

      const skip = (page - 1) * pageSize;

      return await prisma.job.findMany({
        where: whereClause,
        orderBy: [{ priority: 'asc' }, { created_at: 'desc' }, { id: 'desc' }],
        skip: skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          custom_id: true,
          command: true,
          status: true,
          priority: true,
          attempts_made: true,
          max_attempts: true,
          created_at: true,
          processed_on: true,
          finished_on: true,
          exit_code: true,
        },
      });
    } catch (error) {
      throw new Error(`Error listing jobs in queue ${queueId}: ${error}`);
    }
  }

  /**
   * @description Static method to count jobs in a queue with optional status filter.
   * @param queueId The queue ID.
   * @param status Optional status filter.
   * @returns The count of jobs.
   */
  static async countByQueue(
    queueId: number,
    status?: JobStatus
  ): Promise<number> {
    try {
      const whereClause: Prisma.JobWhereInput = { queue_id: queueId };
      if (status) {
        whereClause.status = status;
      }

      return await prisma.job.count({ where: whereClause });
    } catch (error) {
      throw new Error(`Error counting jobs in queue ${queueId}: ${error}`);
    }
  }

  /**
   * @description Static method to retry a failed job by resetting its status.
   * @param jobId The job ID to retry.
   */
  static async retry(jobId: number): Promise<void> {
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
          failed_reason: null,
          stack_trace: null,
          lock_token: null,
          finished_on: null,
          exit_code: null,
        },
      });
    } catch (error) {
      throw new Error(`Error retrying job ${jobId}: ${error}`);
    }
  }

  /**
   * @description This is a function to move the job to cancelled.
   * @param reason The reason for cancellation.
   */
  async moveToCancelled(
    reason: string = 'Job cancelled by user'
  ): Promise<void> {
    if (!this.id) throw new Error('Job ID is required');
    try {
      await prisma.$transaction(async (tx) => {
        const job = await tx.$queryRawUnsafe<any>(
          `SELECT * FROM job WHERE id = $1 FOR UPDATE`,
          this.id
        );

        if (!job) throw new Error(`Job ${this.id} not found for locking`);

        this.status = JobStatus.CANCELLED;
        this.failedReason = reason;
        this.finishedOn = new Date();
        this.lockToken = null;

        await this.save(tx);
      });
    } catch (error) {
      throw new Error(`Error moving job ${this.name} to cancelled: ${error}`);
    }
  }

  /**
   * @description Static method to cancel a job (only if it's pending).
   * @param jobId The job ID to cancel.
   * @param reason The reason for cancellation.
   */
  static async cancelJob(
    jobId: number,
    reason: string = 'Job cancelled by user'
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        const jobLockResult = await tx.$queryRawUnsafe<any>(
          `
      SELECT id FROM "Job"
      WHERE id = $1
      FOR UPDATE
    `,
          jobId
        );

        if (jobLockResult.length === 0) {
          throw new Error(`Job ${jobId} not found`);
        }

        const job = await tx.job.findUnique({
          where: { id: jobId },
          select: { id: true, status: true, name: true },
        });

        if (!job) {
          throw new Error(`Job ${jobId} not found after lock`);
        }

        // TODO: do it for running jobs, by killing the process in remote server.
        if (job.status !== JobStatus.PENDING) {
          throw new Error(
            `Job ${jobId} cannot be cancelled. Only pending jobs can be cancelled. Current status: ${job.status}`
          );
        }

        await tx.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.CANCELLED,
            failed_reason: reason,
            finished_on: new Date(),
            lock_token: null,
          },
        });
      });
    } catch (error) {
      throw new Error(`Error cancelling job ${jobId}: ${error}`);
    }
  }

  /**
   * @description Static method to find a queue by name.
   * @param name The queue name.
   * @returns The queue record or null.
   */
  static async findQueueByName(name: string) {
    try {
      return await prisma.queue.findUnique({
        where: { name },
      });
    } catch (error) {
      throw new Error(`Error finding queue ${name}: ${error}`);
    }
  }
}

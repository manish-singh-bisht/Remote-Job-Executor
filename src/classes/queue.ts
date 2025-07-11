import { EventEmitter } from 'stream';
import { JobStatus, Prisma, QueueStatus } from '../../generated/prisma';
import { JobOptions, QueueOptions, QueueStats } from '../interfaces';
import { Job } from './job';
import prisma from '../lib/prisma';

export class Queue extends EventEmitter {
  public readonly name: string;
  public status: QueueStatus = QueueStatus.ACTIVE;
  public settings: QueueOptions;

  private _queueId?: number;

  constructor(name: string, options: QueueOptions = {}) {
    super();
    this.name = name;

    this.settings = {
      defaultJobOptions: options.defaultJobOptions ?? {
        customId: undefined,
        priority: 0,
        maxAttempts: 1,
        timeout: 30,
        workingDir: '/tmp',
        keepLogs: 50,
      },
    };
  }

  /**
   * @description This is a function to initialize or get existing queue from database.
   */
  protected async waitUntilReady(): Promise<void> {
    try {
      if (this._queueId) return;

      await prisma.$transaction(async (tx) => {
        const result: Prisma.QueueGetPayload<Prisma.QueueDefaultArgs>[] =
          await tx.$queryRawUnsafe(
            `SELECT * FROM "queue" WHERE name = $1 FOR UPDATE`,
            this.name
          );

        if (this._queueId) return;

        let queue = result[0];

        if (!queue) {
          queue = await tx.queue.create({
            data: {
              name: this.name,
              // TODO: this needs to be validated first, for now just casting it to any.
              default_job_options: this.settings.defaultJobOptions as any,
            },
          });
        }

        this._queueId = queue.id;
        this.status = queue.status as QueueStatus;
      });
    } catch (error) {
      throw new Error(`Error waiting until ready: ${error}`);
    }
  }

  /**
   * @description This is a function to add a job to the queue.
   * @param name The name of the job.
   * @param command The command to run.
   * @param args The arguments to pass to the command.
   * @param options The options for the job.
   * @returns The job.
   */
  async add(
    name: string,
    command: string,
    args?: string[],
    options?: JobOptions
  ): Promise<Job> {
    try {
      await this.waitUntilReady();

      if (this.status === QueueStatus.PAUSED) {
        throw new Error(
          `Queue ${this.name} is paused. Please resume the queue to add jobs.`
        );
      }

      // This is where we override the default options for a job when adding a job to the queue.
      const jobOptions = { ...this.settings.defaultJobOptions, ...options };

      return await prisma.$transaction(async (tx) => {
        const job = await Job.create(
          name,
          command,
          this._queueId!,
          args,
          jobOptions,
          tx
        );
        return job;
      });
    } catch (error) {
      throw new Error(`Error adding job in queue ${this.name}: ${error}`);
    }
  }

  /**
   * @description This is a function to get the stats of the queue.
   * @returns The stats of the queue.
   */
  async getStats(): Promise<QueueStats> {
    try {
      await this.waitUntilReady();

      const counts = await prisma.job.groupBy({
        by: ['status'],
        where: {
          queue_id: this._queueId!,
        },
        _count: true,
      });

      const stats: QueueStats = {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        runningJobs: 0,
        stalledJobs: 0,
        pendingJobs: 0,
      };

      for (const item of counts) {
        stats.totalJobs += item._count;

        switch (item.status) {
          case 'COMPLETED':
            stats.completedJobs = item._count;
            break;
          case 'FAILED':
            stats.failedJobs = item._count;
            break;
          case 'RUNNING':
            stats.runningJobs = item._count;
            break;
          case 'STALLED':
            stats.stalledJobs = item._count;
            break;
          case 'PENDING':
            stats.pendingJobs = item._count;
            break;
        }
      }

      return stats;
    } catch (error) {
      throw new Error(`Error getting stats: ${error}`);
    }
  }

  /**
   * @description This is a function to pause the queue.
   */
  async pause(): Promise<void> {
    try {
      await this.waitUntilReady();

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT * FROM "queue" WHERE id = $1 FOR UPDATE`,
          this._queueId
        );

        await tx.queue.update({
          where: { id: this._queueId },
          data: {
            status: QueueStatus.PAUSED,
            paused_at: new Date(),
          },
        });

        this.status = QueueStatus.PAUSED;
        this.emit('paused');
      });
    } catch (error) {
      throw new Error(`Error pausing queue ${this.name}: ${error}`);
    }
  }

  /**
   * @description This is a function to resume the queue.
   */
  async resume(): Promise<void> {
    try {
      await this.waitUntilReady();

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT * FROM "queue" WHERE id = $1 FOR UPDATE`,
          this._queueId
        );

        await tx.queue.update({
          where: { id: this._queueId },
          data: {
            status: QueueStatus.ACTIVE,
            paused_at: null,
          },
        });

        this.status = QueueStatus.ACTIVE;
        this.emit('resumed');
      });
    } catch (error) {
      throw new Error(`Error resuming queue ${this.name}: ${error}`);
    }
  }

  /**
   * @description This is a function to mark the stalled jobs.
   * @param stalledTimeoutMs The timeout for the stalled jobs.
   */
  async markStalledJobs(stalledTimeoutMs: number): Promise<void> {
    try {
      await this.waitUntilReady();

      const threshold = new Date(Date.now() - stalledTimeoutMs);

      await prisma.$transaction(async (tx) => {
        const stalledJobs = await tx.$queryRawUnsafe<any>(
          `
        WITH locked_jobs AS (
          SELECT id FROM job
          WHERE
            status = $1
            AND processed_on < $2
            AND queue_id = $3
          FOR UPDATE SKIP LOCKED
        )
        UPDATE job
        SET status = $4,
            lock_token = NULL
        WHERE id IN (SELECT id FROM locked_jobs)
        RETURNING *
        `,
          JobStatus.RUNNING,
          threshold,
          this._queueId,
          JobStatus.STALLED
        );

        this.emit('jobStalled', stalledJobs);
      });
    } catch (error) {
      throw new Error(
        `Error marking stalled jobs in queue ${this.name}: ${error}`
      );
    }
  }

  /**
   * @description Static method to list queues with pagination.
   * @param page Page number (1-based).
   * @param pageSize Number of items per page.
   * @returns Array of queues with job counts.
   */
  static async listQueues(page: number = 1, pageSize: number = 20) {
    try {
      const skip = (page - 1) * pageSize;

      return await prisma.queue.findMany({
        skip: skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          created_at: true,
          _count: {
            select: { jobs: true },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error listing queues with pagination: ${error}`);
    }
  }

  /**
   * @description Static method to count total number of queues.
   * @returns The total count of queues.
   */
  static async countQueues(): Promise<number> {
    try {
      return await prisma.queue.count();
    } catch (error) {
      throw new Error(`Error counting total number of queues: ${error}`);
    }
  }
}

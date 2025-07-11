import { JobOptions } from './job';

export interface QueueOptions {
  /**
   * @description The default options for jobs.
   */
  defaultJobOptions?: JobOptions;
}

export interface QueueStats {
  /**
   * @description The total number of jobs in the queue.
   */
  totalJobs: number;
  /**
   * @description The number of completed jobs.
   */
  completedJobs: number;
  /**
   * @description The number of failed jobs.
   */
  failedJobs: number;
  /**
   * @description The number of running jobs.
   */
  runningJobs: number;
  /**
   * @description The number of stalled jobs.
   */
  stalledJobs: number;

  /**
   * @description The number of pending jobs.
   */
  pendingJobs: number;
}

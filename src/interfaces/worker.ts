export interface WorkerOptions {
  /**
   * @description The name of the queue to listen to.
   */
  queueName: string;
  /**
   * @description The maximum number of jobs to run concurrently per worker.
   */
  workerConcurrency?: number;
  /**
   * @description The interval in milliseconds to poll for new jobs.
   */
  pollIntervalMs?: number;
  /**
   * @description The timeout in milliseconds to consider a job stalled.
   */
  stalledTimeoutMs?: number;
}

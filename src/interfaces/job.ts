export interface JobOptions {
  /**
   * @description The custom id of the job.
   */
  customId?: string;
  /**
   * @description The priority of the job.
   */
  priority?: number;
  /**
   * @description The maximum number of attempts to make.
   */
  maxAttempts?: number;
  /**
   * @description The timeout in seconds.
   */
  timeout?: number;
  /**
   * @description The working directory of the job.
   */
  workingDir?: string;
  /**
   * @description The number of logs to keep.
   */
  keepLogs?: number;
}

export interface CreateJobData {
  /**
   * @description The name of the job.
   */
  name: string;
  /**
   * @description The command to run.
   */
  command: string;
  /**
   * @description The arguments to pass to the command.
   */
  args?: string[];
  /**
   * @description The options for the job.
   */
  options?: JobOptions;
}

export interface JobExecutionContext {
  /**
   * @description The command to run.
   */
  command: string;
  /**
   * @description The arguments to pass to the command.
   */
  args?: string[];
  /**
   * @description The working directory of the job.
   */
  workingDir?: string;
  /**
   * @description The timeout in milliseconds.
   */
  timeout?: number;
}

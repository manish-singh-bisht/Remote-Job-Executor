import { NodeSSH } from 'node-ssh';
import { Job } from './job';
import { RemoteExecutionConfig, ExecutionResult } from '../interfaces';
import shellEscape from 'shell-escape';

export class RemoteExecutor {
  private ssh: NodeSSH;
  private config: RemoteExecutionConfig;

  constructor(config: RemoteExecutionConfig) {
    this.ssh = new NodeSSH();
    this.config = config;
  }

  /**
   * Connect to the remote server
   */
  async connect(): Promise<void> {
    try {
      await this.ssh.connect(this.config.ssh);
    } catch (error) {
      throw new Error(`Failed to connect to remote server: ${error}`);
    }
  }

  /**
   * Disconnect from the remote server
   */
  async disconnect(): Promise<void> {
    try {
      this.ssh.dispose();
    } catch (error) {
      throw new Error(`Failed to disconnect from remote server: ${error}`);
    }
  }

  /**
   * Execute a job remotely via SSH
   */
  async executeJob(job: Job): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const fullCommand = this.buildCommand(job);

      const envString = this.config.env
        ? Object.entries(this.config.env)
            .map(([key, value]) => `export ${key}="${value}";`)
            .join(' ')
        : '';

      const commandWithEnv = envString
        ? `${envString} ${fullCommand}`
        : fullCommand;

      const result = await this.ssh.execCommand(commandWithEnv, {
        cwd: job.workingDir || this.config.workingDir || '/tmp',
        onStdout: (chunk) => {
          const message = chunk.toString();
          job.addLog(`[stdout] ${message}`).catch(console.error);
        },
        onStderr: (chunk) => {
          const message = chunk.toString();
          job.addLog(`[stderr] ${message}`).catch(console.error);
        },
      });

      const duration = Date.now() - startTime;

      return {
        exitCode: result.code ?? 0,
        stdout: result.stdout,
        stderr: result.stderr,
        duration,
      };
    } catch (error) {
      throw new Error(`Error executing job ${job.name}: ${error}`);
    }
  }

  /**
   * Execute a job with timeout support
   */
  async executeJobWithTimeout(job: Job): Promise<ExecutionResult> {
    if (job.timeout) {
      return Promise.race([
        this.executeJob(job),
        new Promise<ExecutionResult>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Job timed out after ${job.timeout} seconds`));
          }, job.timeout! * 1000);
        }),
      ]);
    }

    return this.executeJob(job);
  }

  /**
   * Build the full command string with arguments
   */

  private buildCommand(job: Job): string {
    if (!job.args || job.args.length === 0) {
      return job.command;
    }

    const commandWithArgs = shellEscape([job.command, ...job.args]);
    return commandWithArgs;
  }

  /**
   * Get remote server information
   */
  async getServerInfo(): Promise<{ hostname: string; uptime: string }> {
    const hostnameResult = await this.ssh.execCommand('hostname');
    const uptimeResult = await this.ssh.execCommand('uptime');

    return {
      hostname: hostnameResult.stdout.trim(),
      uptime: uptimeResult.stdout.trim(),
    };
  }

  /**
   * Transfer files to remote server if needed
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    try {
      await this.ssh.putFile(localPath, remotePath);
    } catch (error) {
      throw new Error(`Error uploading file to remote server: ${error}`);
    }
  }

  /**
   * Test the connection to the remote server
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.ssh.execCommand(
        'echo "Connection test successful"'
      );
      return result.code === 0;
    } catch (error) {
      return false;
    }
  }
}

export interface SSHConnectionConfig {
  host: string;
  port?: number; // default 22
  username: string;

  // either password or privateKey must be provided
  password?: string;
  privateKey?: string;
  passphrase?: string; // if privateKey is provided, passphrase is required
  readyTimeout?: number;
}

export interface RemoteExecutionConfig {
  ssh: SSHConnectionConfig;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

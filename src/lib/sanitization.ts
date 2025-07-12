import * as path from 'path';
import * as fs from 'fs';

/**
 * Sanitization utilities for CLI input validation
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates and sanitizes queue names
 */
export function sanitizeQueueName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Queue name is required and must be a string');
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Queue name cannot be empty');
  }

  if (trimmed.length > 100) {
    throw new ValidationError('Queue name cannot exceed 100 characters');
  }

  // Allow alphanumeric, hyphens, underscores, and dots
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new ValidationError(
      'Queue name can only contain letters, numbers, dots, hyphens, and underscores'
    );
  }

  return trimmed;
}

/**
 * Validates and sanitizes job names
 */
export function sanitizeJobName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Job name is required and must be a string');
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Job name cannot be empty');
  }

  if (trimmed.length > 200) {
    throw new ValidationError('Job name cannot exceed 200 characters');
  }

  // Allow alphanumeric, spaces, hyphens, underscores, and dots
  if (!/^[a-zA-Z0-9._\s-]+$/.test(trimmed)) {
    throw new ValidationError(
      'Job name can only contain letters, numbers, spaces, dots, hyphens, and underscores'
    );
  }

  return trimmed;
}

/**
 * Validates and sanitizes commands
 */
export function sanitizeCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    throw new ValidationError('Command is required and must be a string');
  }

  const trimmed = command.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Command cannot be empty');
  }

  if (trimmed.length > 1000) {
    throw new ValidationError('Command cannot exceed 1000 characters');
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /rm\s+-rf\s+\/(?!tmp|var\/tmp)/i, // Dangerous rm commands (except /tmp)
    /chmod\s+777/i, // Overly permissive chmod
    />\s*\/dev\/sd[a-z]/i, // Writing to disk devices
    /mkfs\./i, // Format filesystem
    /dd\s+.*of=/i, // Dangerous dd commands
    /:\(\)\{.*;\}/i, // Fork bomb pattern
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      throw new ValidationError(
        'Command contains potentially dangerous operations'
      );
    }
  }

  return trimmed;
}

/**
 * Validates and sanitizes command arguments
 */
export function sanitizeArgs(args: string[]): string[] {
  if (!Array.isArray(args)) {
    throw new ValidationError('Arguments must be an array');
  }

  return args.map((arg, index) => {
    if (typeof arg !== 'string') {
      throw new ValidationError(`Argument ${index} must be a string`);
    }

    if (arg.length > 500) {
      throw new ValidationError(`Argument ${index} exceeds 500 characters`);
    }

    // Check for null bytes and other control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(arg)) {
      throw new ValidationError(
        `Argument ${index} contains invalid control characters`
      );
    }

    return arg;
  });
}

/**
 * Validates and sanitizes custom IDs
 */
export function sanitizeCustomId(customId: string): string {
  if (!customId || typeof customId !== 'string') {
    throw new ValidationError('Custom ID must be a string');
  }

  const trimmed = customId.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Custom ID cannot be empty');
  }

  if (trimmed.length > 100) {
    throw new ValidationError('Custom ID cannot exceed 100 characters');
  }

  // Allow alphanumeric, hyphens, underscores, and dots
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new ValidationError(
      'Custom ID can only contain letters, numbers, dots, hyphens, and underscores'
    );
  }

  return trimmed;
}

/**
 * Validates numeric inputs
 */
export function sanitizeNumber(
  value: string,
  fieldName: string,
  min?: number,
  max?: number
): number {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }

  const num = parseInt(value, 10);

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} cannot exceed ${max}`);
  }

  return num;
}

/**
 * Validates and sanitizes file paths
 */
export function sanitizeFilePath(filePath: string, fieldName: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }

  const trimmed = filePath.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }

  // Resolve to absolute path to prevent directory traversal
  const resolved = path.resolve(trimmed);

  // Basic security checks
  if (resolved.includes('..')) {
    throw new ValidationError(`${fieldName} contains invalid path traversal`);
  }

  if (resolved.length > 500) {
    throw new ValidationError(`${fieldName} path is too long`);
  }

  return resolved;
}

/**
 * Validates SSH key file path and permissions
 */
export function sanitizeSSHKeyPath(keyPath: string): string {
  const sanitized = sanitizeFilePath(keyPath, 'SSH key path');

  try {
    const stats = fs.statSync(sanitized);

    if (!stats.isFile()) {
      throw new ValidationError('SSH key path must point to a file');
    }

    // Check file permissions (should not be world-readable)
    const mode = stats.mode & parseInt('777', 8);
    if (mode & parseInt('044', 8)) {
      console.warn(
        'Warning: SSH key file is readable by others, consider changing permissions'
      );
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new ValidationError('SSH key file does not exist');
    }
    throw new ValidationError(`Cannot access SSH key file: ${error}`);
  }

  return sanitized;
}

/**
 * Validates working directory paths
 */
export function sanitizeWorkingDir(workDir: string): string {
  if (!workDir || typeof workDir !== 'string') {
    throw new ValidationError('Working directory is required');
  }

  const trimmed = workDir.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Working directory cannot be empty');
  }

  if (trimmed.length > 500) {
    throw new ValidationError('Working directory path is too long');
  }

  // Must be absolute path for security
  if (!path.isAbsolute(trimmed)) {
    throw new ValidationError('Working directory must be an absolute path');
  }

  // Prevent access to sensitive directories
  const dangerous = ['/etc', '/proc', '/sys', '/dev', '/boot'];
  for (const dir of dangerous) {
    if (trimmed.startsWith(dir)) {
      throw new ValidationError(`Working directory cannot be in ${dir}`);
    }
  }

  return trimmed;
}

/**
 * Validates SSH hostnames/IPs
 */
export function sanitizeSSHHost(host: string): string {
  if (!host || typeof host !== 'string') {
    throw new ValidationError('SSH host is required');
  }

  const trimmed = host.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('SSH host cannot be empty');
  }

  if (trimmed.length > 253) {
    throw new ValidationError('SSH host name is too long');
  }

  // Basic hostname/IP validation
  const hostnameRegex = /^[a-zA-Z0-9.-]+$/;
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  if (!hostnameRegex.test(trimmed) && !ipRegex.test(trimmed)) {
    throw new ValidationError(
      'SSH host must be a valid hostname or IP address'
    );
  }

  // Prevent localhost attacks in production
  const localhostPatterns = ['localhost', '127.', '0.0.0.0', '::1'];
  if (process.env.NODE_ENV === 'production') {
    for (const pattern of localhostPatterns) {
      if (trimmed.includes(pattern)) {
        console.warn(
          'Warning: Using localhost/loopback addresses in production environment'
        );
        break;
      }
    }
  }

  return trimmed;
}

/**
 * Validates SSH usernames
 */
export function sanitizeSSHUsername(username: string): string {
  if (!username || typeof username !== 'string') {
    throw new ValidationError('SSH username is required');
  }

  const trimmed = username.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('SSH username cannot be empty');
  }

  if (trimmed.length > 32) {
    throw new ValidationError('SSH username cannot exceed 32 characters');
  }

  // Unix username validation
  if (!/^[a-z_][a-z0-9_-]*$/.test(trimmed)) {
    throw new ValidationError('SSH username must be a valid Unix username');
  }

  // Warn about root usage
  if (trimmed === 'root') {
    console.warn(
      'Warning: Using root user for SSH connections is not recommended'
    );
  }

  return trimmed;
}

/**
 * Validates status filter values
 */
export function sanitizeStatus(status: string): string {
  if (!status || typeof status !== 'string') {
    throw new ValidationError('Status filter is required');
  }

  const upperStatus = status.toUpperCase().trim();
  const validStatuses = [
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'STALLED',
    'CANCELLED',
  ];

  if (!validStatuses.includes(upperStatus)) {
    throw new ValidationError(
      `Status must be one of: ${validStatuses.join(', ')}`
    );
  }

  return upperStatus;
}

/**
 * Sanitizes environment variables
 */
export function sanitizeEnvVars(
  env: Record<string, string>
): Record<string, string> {
  if (!env || typeof env !== 'object') {
    throw new ValidationError('Environment variables must be an object');
  }

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Validate key
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new ValidationError(`Invalid environment variable name: ${key}`);
    }

    if (key.length > 100) {
      throw new ValidationError(`Environment variable name too long: ${key}`);
    }

    // Validate value
    if (typeof value !== 'string') {
      throw new ValidationError(
        `Environment variable value must be string: ${key}`
      );
    }

    if (value.length > 1000) {
      throw new ValidationError(`Environment variable value too long: ${key}`);
    }

    // Check for null bytes
    if (value.includes('\0')) {
      throw new ValidationError(
        `Environment variable contains null bytes: ${key}`
      );
    }

    sanitized[key] = value;
  }

  return sanitized;
}

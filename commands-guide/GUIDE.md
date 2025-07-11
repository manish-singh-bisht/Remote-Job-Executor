# Remote Job Executor - Complete Commands Guide

This guide provides a comprehensive overview of all commands available in the Remote Job Executor, with explanations and examples.

## 🚀 Initial Setup

### 1. Installation Options

#### For Developers (Local Development)

````bash
# Clone the repository
git clone <your-repo-url>
cd Remote-Job-Executor

# Install dependencies
pnpm install

# Create environment file for default SSH settings and db, modify them with your own.
cp .env.example .env
# Environment variables allow you to set default SSH connection parameters so you don't need to specify them in every command.

# The docker-compose.yml includes both a PostgreSQL database service and a local Docker container that simulates a remote server with SSH access, used to test remote job execution locally. The environment variables defined in .env.example are intended for configuring this simulated remote server.
docker compose up -d

# Generate Prisma client (creates database interface)
pnpm run prisma:generate

# Push database schema to your database
pnpm run prisma:push

# Build and link locally
pnpm build:link

# Test local CLI
rje --help

---

## 📋 Queue Management

Queues are containers that hold jobs. Think of them as different work categories or environments.

### Create Basic Queue

```bash
# Create a simple queue with default settings
rje queue create --name "my-first-queue"
```

**Explanation**: Creates a new job queue named "my-first-queue" with default settings (3 max attempts, no timeout, default working directory).

### Create Advanced Queue

```bash
# Create a production queue with custom settings
rje queue create \
  --name "production-queue" \
  --max-attempts 5 \
  --timeout 600 \
  --working-dir "/app/workspace" \
  --keep-logs 100
```

**Explanation**:

- `--max-attempts 5`: Jobs will retry up to 5 times if they fail
- `--timeout 600`: Jobs will be killed after 600 seconds (10 minutes)
- `--working-dir "/app/workspace"`: Jobs run from this directory on remote server
- `--keep-logs 100`: Keep the last 100 log entries per job

### List All Queues

```bash
# Show all queues with their status and job counts
rje queue list

# Show specific page (20 queues per page)
rje queue list --page 2
```

**Explanation**: Displays a table showing queue ID, name, status (ACTIVE/PAUSED), number of jobs, and creation date.

### Queue Control

```bash
# Pause a queue (stops processing new jobs)
rje queue pause --name "my-first-queue"

# Resume a paused queue
rje queue resume --name "my-first-queue"
```

**Explanation**: Pausing prevents workers from picking up new jobs from this queue. Existing running jobs continue, but no new ones start.

### Queue Statistics

```bash
# Show detailed statistics for a queue
rje queue stats --name "production-queue"
```

**Explanation**: Shows total jobs, pending, running, completed, failed, and stalled job counts for the specified queue.

---

## 🚀 Job Creation and Management

Jobs are individual tasks that get executed on remote servers.

### Simple Jobs (No Arguments)

```bash

# Check current date and time
rje job add \
  --queue "my-first-queue" \
  --name "current-date" \
  --command "date"

# Show system information
rje job add \
  --queue "my-first-queue" \
  --name "system-info" \
  --command "uname -a"

# Check disk usage
rje job add \
  --queue "my-first-queue" \
  --name "disk-usage" \
  --command "df -h"

# Show memory information
rje job add \
  --queue "my-first-queue" \
  --name "memory-info" \
  --command "free -h"
```

**Explanation**: These create simple jobs that execute single commands without additional parameters. Each job gets a unique name and runs the specified command.

### Jobs With Arguments

```bash
# Find log files modified in the last day
rje job add --queue "my-first-queue" --name "find-recent-logs" --command "find" --args '["/var/log", "-name", "*.log", "-type", "f", "-mtime", "-1"]'



# Search for errors in log files
rje job add \
  --queue "my-first-queue" \
  --name "search-errors" \
  --command "grep" \
  --args "-r" "ERROR" "/var/log"


# Ping test with specific parameters
rje job add \
  --queue "my-first-queue" \
  --name "network-test" \
  --command "ping" \
  --args "-c" "3" "google.com"
```

### Advanced Jobs with All Options

```bash
# Critical backup job with high priority and custom settings
rje job add \
  --queue "my-first-queue" \
  --name "critical-backup" \
  --command "tar" \
  --args "-czf" "/tmp/backup.tar.gz" "/home/user/important" \
  --custom-id "backup-001" \
  --priority 1 \
  --max-attempts 3 \
  --timeout 1800 \
  --working-dir "/tmp" \
  --keep-logs 100

# System health check with monitoring
rje job add \
  --queue "my-first-queue" \
  --name "health-check" \
  --command "sh" \
  --args "-c" "echo 'CPU:'; cat /proc/loadavg; echo 'Memory:'; free -m; echo 'Disk:'; df -h /" \
  --custom-id "health-001" \
  --priority 0 \
  --max-attempts 2 \
  --timeout 60
```

**Explanation**:

- `--custom-id`: Your own identifier for the job (useful for tracking)
- `--priority`: Lower numbers = higher priority (0 is highest)
- `--max-attempts`: How many times to retry if job fails
- `--timeout`: Kill job after this many seconds
- `--working-dir`: Directory to run the job in
- `--keep-logs`: Number of log entries to keep

### Script-Based Jobs

```bash
# Execute a Python script, Python must be installed
rje job add \
  --queue "my-first-queue" \
  --name "python-task" \
  --command "python3" \
  --args "-c" "import sys; print(f'Python version: {sys.version}'); print('Task completed!')"

# Run a shell script with multiple commands
rje job add \
  --queue "my-first-queue" \
  --name "multi-step-task" \
  --command "sh" \
  --args "-c" "echo 'Starting...'; sleep 2; echo 'Processing...'; sleep 1; echo 'Done\!'"


---

## 📜 Script Upload and Management

Upload local scripts to remote servers before executing them.

### Upload Script with Password Authentication

```bash
# Upload a backup script to remote server
rje job upload-script \
  --script "./my-scripts/backup.sh" \
  --remote-dir "/tmp" \
  --ssh-host "localhost" \
  --ssh-user "root" \
  --ssh-password "your_password" \
  --make-executable
```

**Explanation**: Uploads `backup.sh` from your local `my-scripts` folder to `/tmp/` on the remote server, makes it executable, using password authentication.

### Upload Script with SSH Key

```bash
# Upload monitoring script using SSH key
rje job upload-script \
  --script "./my-scripts/monitor.sh" \
  --remote-dir "/opt/scripts" \
  --remote-name "system-monitor.sh" \
  --ssh-host "server.example.com" \
  --ssh-user "deploy" \
  --ssh-key "~/.ssh/id_rsa" \
  --ssh-passphrase "key_password" \
  --make-executable
```

**Explanation**:

- `--remote-name`: Changes the filename on the remote server
- `--ssh-key`: Uses SSH key file instead of password
- `--ssh-passphrase`: Password for the SSH key (if encrypted)
- `--make-executable`: Adds execute permissions to the uploaded file

### Create Jobs to Execute Uploaded Scripts

```bash
# Run the uploaded backup script
rje job add \
  --queue "my-first-queue" \
  --name "daily-backup" \
  --command "/tmp/backup.sh" \
  --custom-id "backup-daily-001"

# Run monitoring script
rje job add \
  --queue "my-first-queue" \
  --name "system-monitor" \
  --command "/opt/scripts/system-monitor.sh" \
  --custom-id "monitor-001"

# Run Python script with arguments
rje job add \
  --queue "my-first-queue" \
  --name "process-data" \
  --command "python3" \
  --args "/app/scripts/process_data.py" "user_data" \
  --custom-id "process-001"
```

**Explanation**: After uploading scripts, create jobs that reference the remote file paths to execute them.

---

## 📊 Job Monitoring and Management

### List Jobs in Queue

```bash
# Show all jobs in a queue
rje job list --queue "my-first-queue"

# Filter jobs by status
rje job list --queue "my-first-queue" --status "PENDING"
rje job list --queue "my-first-queue" --status "RUNNING"
rje job list --queue "my-first-queue" --status "COMPLETED"
rje job list --queue "my-first-queue" --status "FAILED"
rje job list --queue "my-first-queue" --status "STALLED"

# Show specific page (20 jobs per page)
rje job list --queue "my-first-queue" --page 2
```

**Explanation**:

- `PENDING`: Job is waiting to be processed
- `RUNNING`: Job is currently being executed
- `COMPLETED`: Job finished successfully
- `FAILED`: Job failed after all retry attempts
- `STALLED`: Job appears stuck (worker may have crashed)

### View Job Details

```bash
# Show detailed information about a job by ID
rje job show --id 1

# Show job details using your custom ID
rje job show --custom-id "backup-001" --queue "my-first-queue"
```

**Explanation**: Shows complete job information including command, arguments, status, attempts, timing, and exit code.

### View Job Logs

```bash
# Show recent logs for a job
rje job logs --id 1 --limit 50

# Follow logs in real-time (like tail -f)
rje job logs --id 1 --follow

# View logs using custom ID
rje job logs --custom-id "backup-001" --queue "my-first-queue" --limit 100

# Follow logs by custom ID
rje job logs --custom-id "process-001" --queue "my-first-queue" --follow
```

**Explanation**:

- `--limit`: Number of log lines to show
- `--follow`: Continuously shows new log output as it appears (press Ctrl+C to stop)

### Retry Failed Jobs

```bash
# Retry a failed job by ID
rje job retry --id 1

# Retry using custom ID
rje job retry --custom-id "backup-001" --queue "my-first-queue"
```

**Explanation**: Resets a failed job back to PENDING status so it can be picked up by workers again.

---

## 👷 Worker Management

Workers are processes that pick up jobs from queues and execute them on remote servers.

### Test SSH Connection First

```bash
# Test SSH connection with password
rje ssh-test \
  --host "localhost" \
  --username "user" \
  --password "password" \
  --port 2222

# Test SSH connection with key
rje ssh-test \
  --host "server.example.com" \
  --username "deploy" \
  --private-key "~/.ssh/id_rsa" \
  --passphrase "key_password" \
  --timeout 30000
```

**Explanation**: Always test SSH connectivity before starting workers. This command verifies you can connect and shows server information.

### Start Single Worker

```bash
# Basic worker with password authentication
rje worker start \
  --queue "my-first-queue" \
  --ssh-host "localhost" \
  --remote-workdir "/tmp/"

```

**Explanation**:

- Worker connects to the specified SSH server
- Polls the queue for new jobs every 5 seconds (default)
- Executes jobs on the remote server
- Reports results back to the database

### High-Performance Worker

```bash
# Worker with custom performance settings
rje worker start \
  --queue "my-first-queue" \
  --concurrency 8 \
  --poll-interval 2000 \
  --stalled-timeout 120000 \
  --ssh-host "worker-node.com" \
  --ssh-user "batch" \
  --ssh-password "secure_pass" \
  --remote-workdir "/opt/batch_jobs"
```

**Explanation**:

- `--concurrency 8`: Run up to 8 jobs simultaneously
- `--poll-interval 2000`: Check for new jobs every 2 seconds
- `--stalled-timeout 120000`: Consider jobs stalled after 2 minutes of no activity
- Higher concurrency = more jobs at once, but uses more resources

### Multiple Workers (Run in separate terminals)

```bash
# Terminal 1 - High priority worker
rje worker start \
  --queue "high-priority" \
  --concurrency 5 \
  --poll-interval 1000 \
  --ssh-host "worker1.example.com" \
  --ssh-user "worker" \
  --ssh-key "~/.ssh/worker_key"

# Terminal 2 - Batch processing worker
rje worker start \
  --queue "batch-processing" \
  --concurrency 10 \
  --poll-interval 3000 \
  --ssh-host "worker2.example.com" \
  --ssh-user "batch" \
  --ssh-password "batch_password"

# Terminal 3 - General purpose worker
rje worker start \
  --queue "general" \
  --concurrency 3 \
  --ssh-host "worker3.example.com" \
  --ssh-user "general" \
  --ssh-key "~/.ssh/general_key"
```

**Explanation**: Running multiple workers allows you to:

- Process different types of jobs on different servers
- Scale processing power across multiple machines
- Have specialized workers for different workloads

### Using Environment Variables

```bash
# Set up environment variables (create .env file)

# Start worker using environment variables
rje worker start --queue "my-first-queue"
```

**Explanation**: Environment variables make it easier to start workers without typing all SSH details each time.

---

## 🏥 Health Monitoring and Metrics

### System Metrics

```bash

# Collects metric at that particular time stamp
rje metric collect

# View recent system metrics (RAM, CPU, uptime)
rje metric show --limit 10

# View more detailed metrics history
rje metric show --limit 50


---

## 🎯 Complete Workflow Examples

### Example 1: Simple Batch Processing

```bash
# 1. Create a queue for batch processing
rje queue create --name "batch-jobs" --timeout 300

# 2. Add multiple processing jobs
rje job add --queue "batch-jobs" --name "process-file-1" --command "echo" --args "Processing file 1..."
rje job add --queue "batch-jobs" --name "process-file-2" --command "echo" --args "Processing file 2..."
rje job add --queue "batch-jobs" --name "process-file-3" --command "echo" --args "Processing file 3..."

# 3. Start a worker to process the jobs
rje worker start \
  --queue "batch-jobs" \
  --concurrency 2 \
  --ssh-host "YOUR_SERVER_IP" \
  --ssh-user "YOUR_USERNAME" \
  --ssh-password "YOUR_PASSWORD"

```

### Example 2: System Monitoring Setup

```bash
# 1. Create monitoring queue
rje queue create --name "monitoring" --timeout 60

# 2. Add monitoring jobs
rje job add \
  --queue "monitoring" \
  --name "disk-check" \
  --command "df" \
  --args "-h" \
  --custom-id "disk-monitor-001"

rje job add \
  --queue "monitoring" \
  --name "memory-check" \
  --command "free" \
  --args "-h" \
  --custom-id "memory-monitor-001"

# 3. Start dedicated monitoring worker
rje worker start \
  --queue "monitoring" \
  --concurrency 1 \
  --poll-interval 1000 \
  --ssh-host "YOUR_MONITOR_SERVER" \
  --ssh-user "monitor" \
  --ssh-key "~/.ssh/monitor_key"

# 4. View monitoring results
rje job logs --custom-id "disk-monitor-001" --queue "monitoring"
```

### Example 3: Script Upload and Execution

```bash
# 1. Create a local script file
echo '#!/bin/bash
echo "Backup started at: $(date)"
mkdir -p /tmp/backup
echo "System info:" > /tmp/backup/info.txt
uname -a >> /tmp/backup/info.txt
echo "Backup completed!"' > my-backup.sh

# 2. Upload script to remote server
rje job upload-script \
  --script "./my-backup.sh" \
  --remote-dir "/scripts" \
  --ssh-host "YOUR_SERVER_IP" \
  --ssh-user "YOUR_USERNAME" \
  --ssh-password "YOUR_PASSWORD" \
  --make-executable

# 3. Create queue for script jobs
rje queue create --name "scripts"

# 4. Create job to run the uploaded script
rje job add \
  --queue "scripts" \
  --name "daily-backup" \
  --command "/scripts/my-backup.sh" \
  --custom-id "backup-$(date +%Y%m%d)"

# 5. Start worker to execute scripts
rje worker start \
  --queue "scripts" \
  --ssh-host "YOUR_SERVER_IP" \
  --ssh-user "YOUR_USERNAME" \
  --ssh-password "YOUR_PASSWORD"
```

---

## 🛠️ Troubleshooting Commands

### Check Job Status

```bash
# Find jobs that failed
rje job list --queue "YOUR_QUEUE" --status "FAILED"

# Find stalled jobs
rje job list --queue "YOUR_QUEUE" --status "STALLED"

# Check specific job details
rje job show --id JOB_ID
```

### Worker Debugging

```bash
# Test SSH connection before starting worker
rje ssh-test --host "YOUR_HOST" --username "YOUR_USER" --password "YOUR_PASSWORD"

```

### Queue Management

```bash
# Pause queue to stop new job processing
rje queue pause --name "YOUR_QUEUE"

# Resume queue
rje queue resume --name "YOUR_QUEUE"

# Check queue statistics
rje queue stats --name "YOUR_QUEUE"
```

---

## 🔄 Quick Reference

### Most Common Commands

```bash
# Create queue
rje queue create --name "QUEUE_NAME"

# Add simple job
rje job add --queue "QUEUE_NAME" --name "JOB_NAME" --command "COMMAND"

# Start worker
rje worker start --queue "QUEUE_NAME" --ssh-host "HOST" --ssh-user "USER" --ssh-password "PASSWORD"

# View job logs
rje job logs --id JOB_ID --follow
```

This completes the comprehensive command guide for the Remote Job Executor. Each command includes explanations to help you understand what it does and when to use it.
````

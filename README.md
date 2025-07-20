# Remote-Job-Executor

Remote-Job-Executor is a lightweight job execution system that enables you to queue and execute shell commands across remote servers via SSH.

- **Queue Management**: Create and manage job queues with different priorities and configurations.
- **Remote Execution**: Execute commands and scripts on remote servers via SSH.
- **Job Monitoring**: Track job status, logs, and metrics in real-time.
- **Worker Management**: Manage worker processes that execute your jobs.
- **CLI Interface**: Easy-to-use command-line interface for all operations.

## DEMO

[Screencast from 12-07-25 05:33:47 AM IST.webm](https://github.com/user-attachments/assets/fd4650c8-d1b8-4f25-a68e-f5b88d034a65)

## Local Installation

### Prerequisites

- Node.js 18+
- pnpm (Package Manager)
- PostgreSQL database
- Docker (optional, for local testing)

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd Remote-Job-Executor
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment**

   ```bash
   # Create environment file
   cp .env.example .env
   # Edit .env with your database and SSH settings
   ```

4. **Start services (optional - for local testing)**

   ```bash
   # Starts PostgreSQL and test SSH server
   docker compose up -d
   ```

5. **Set up database**

   ```bash
   # Generate Prisma client
   pnpm run prisma:generate

   # Push database schema
   pnpm run prisma:push
   ```

6. **Build and install CLI**

   ```bash
   # Build and link CLI globally
   pnpm run build:link
   ```

7. **Test installation**
   ```bash
   # Test the CLI
   rje --help
   ```
8. **Test DB setup**

   ```bash

   # To run tests, you will need a test DB, setup one locally.
   # Push the schema to the test DB

   DATABASE_URL="postgresql://your_user:your_password@localhost:5432/remote_job_test" pnpm prisma db push

   # To run tests

   pnpm test

   ```

## Quick Start

Once installed, you can start using the CLI:

```bash
# Create your first queue
rje queue create --name "my-first-queue"

# Add a simple job
rje job add --queue "my-first-queue" --name "test-job" --command "date"

# List jobs
rje job list --queue "my-first-queue"

# Start a worker to process jobs
rje worker start --queue "my-first-queue"
```

## 📖 Complete Documentation

For detailed usage instructions, examples, and all available commands, see the **[Complete Commands Guide](./commands-guide/GUIDE.md)**.

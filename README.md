# Remote-Job-Executor

Remote-Job-Executor is a lightweight, powerful system inspired by BullMQ. It allows you to queue jobs locally and execute them remotely over SSH with real-time monitoring.

## 🚀 What is Remote-Job-Executor?

Remote-Job-Executor is a comprehensive solution for:

- **Queue Management**: Create and manage job queues with different priorities and configurations.
- **Remote Execution**: Execute commands and scripts on remote servers via SSH.
- **Job Monitoring**: Track job status, logs, and metrics in real-time.
- **Worker Management**: Manage worker processes that execute your jobs.
- **CLI Interface**: Easy-to-use command-line interface for all operations.

## DEMO
[Screencast from 12-07-25 05:33:47 AM IST.webm](https://github.com/user-attachments/assets/92318d57-2fef-4331-90e1-66cab171566b)


## 📦 Local Installation

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

## 🎯 Quick Start

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

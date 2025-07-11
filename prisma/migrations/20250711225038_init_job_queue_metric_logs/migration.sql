-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'STALLED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "job" (
    "id" SERIAL NOT NULL,
    "custom_id" TEXT,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" JSONB,
    "working_dir" TEXT,
    "timeout" INTEGER,
    "std_out" TEXT,
    "std_err" TEXT,
    "exit_code" INTEGER,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 0,
    "attempts_made" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "processed_on" TIMESTAMP(3),
    "finished_on" TIMESTAMP(3),
    "failed_reason" TEXT,
    "stack_trace" TEXT,
    "lock_token" TEXT,
    "keep_logs" INTEGER DEFAULT 50,
    "queue_id" INTEGER NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_log" (
    "id" TEXT NOT NULL,
    "job_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'ACTIVE',
    "default_job_options" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "paused_at" TIMESTAMP(3),

    CONSTRAINT "queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metric" (
    "id" TEXT NOT NULL,
    "ram_usage_mb" INTEGER NOT NULL,
    "cpu_usage_percent" DOUBLE PRECISION NOT NULL,
    "uptime_seconds" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_metric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_custom_id_key" ON "job"("custom_id");

-- CreateIndex
CREATE INDEX "job_status_queue_id_lock_token_priority_created_at_id_idx" ON "job"("status", "queue_id", "lock_token", "priority", "created_at", "id");

-- CreateIndex
CREATE INDEX "job_queue_id_priority_created_at_idx" ON "job"("queue_id", "priority", "created_at");

-- CreateIndex
CREATE INDEX "job_lock_token_status_idx" ON "job"("lock_token", "status");

-- CreateIndex
CREATE INDEX "job_queue_id_status_idx" ON "job"("queue_id", "status");

-- CreateIndex
CREATE INDEX "job_queue_id_status_processed_on_idx" ON "job"("queue_id", "status", "processed_on");

-- CreateIndex
CREATE INDEX "job_custom_id_idx" ON "job"("custom_id");

-- CreateIndex
CREATE INDEX "job_log_job_id_sequence_idx" ON "job_log"("job_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "job_log_job_id_sequence_key" ON "job_log"("job_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "queue_name_key" ON "queue"("name");

-- CreateIndex
CREATE INDEX "system_metric_timestamp_idx" ON "system_metric"("timestamp");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_log" ADD CONSTRAINT "job_log_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

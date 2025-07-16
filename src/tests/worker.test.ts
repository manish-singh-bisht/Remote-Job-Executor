import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { Worker } from '../classes/worker';
import { Queue } from '../classes/queue';
import { Job } from '../classes/job';
import prisma from '../lib/prisma';
import { RemoteExecutor } from '../classes/remote-executor';
import { closePgClient } from '../lib/pg';

describe('Worker', () => {
  let queue: Queue;
  let sandbox: sinon.SinonSandbox;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    await prisma.jobLog.deleteMany();
    await prisma.job.deleteMany();
    await prisma.queue.deleteMany();

    queue = new Queue('concurrent-queue', {
      defaultJobOptions: { maxAttempts: 1, timeout: 5 },
    });
    await queue.createQueue();
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(async () => {
    await closePgClient();
    await prisma.$disconnect();
  });

  it('should process jobs concurrently', async () => {
    const job1 = await queue.add('job-1', 'echo', ['1']);
    const job2 = await queue.add('job-2', 'echo', ['2']);
    const job3 = await queue.add('job-3', 'echo', ['3']);

    sandbox.stub(RemoteExecutor.prototype, 'connect').resolves();

    sandbox.stub(RemoteExecutor.prototype, 'disconnect').resolves();

    sandbox.stub(RemoteExecutor.prototype, 'testConnection').resolves(true);

    sandbox.stub(RemoteExecutor.prototype, 'getServerInfo').resolves({
      hostname: 'test-server',
      uptime: 'up 1 day',
    });

    sandbox
      .stub(RemoteExecutor.prototype, 'executeJobWithTimeout')
      .callsFake(async (job: Job) => {
        await new Promise((r) => setTimeout(r, 500)); // simulate delay for each job
        return {
          exitCode: 0,
          stdout: `done-${job.name}`,
          stderr: '',
          duration: 500,
        };
      });

    const testWorker = new Worker(
      queue,
      {
        queueName: 'concurrent-queue',
        workerConcurrency: 2,
        pollIntervalMs: 100, // polling interval is 100ms,
        stalledTimeoutMs: 30000,
      },
      {
        ssh: {
          host: 'localhost',
          username: 'user',
          password: 'password',
        },
      }
    );

    const completedJobs: Job[] = [];

    testWorker.on('jobCompleted', (job) => {
      completedJobs.push(job);
    });

    // Start worker without awaiting - it runs in an infinite loop
    testWorker.start().catch(console.error);

    const start = Date.now();

    // Wait for worker to process jobs
    await new Promise((r) => setTimeout(r, 1200)); // so if three jobs running one after another, it should take 3*500ms = 1500ms, but the worker runs concurrently so it should take less than 1500ms, remember there is polling interval of 100ms, so it will take 1000ms+ 100ms = 1100ms, but we are waiting for 1200ms, so it should take less than 1200ms

    const duration = Date.now() - start;

    await testWorker.stop();

    expect(duration).to.be.lessThan(1300);
    expect(completedJobs).to.have.lengthOf(3);

    const dbJobs = await prisma.job.findMany({
      where: { queue_id: queue['_queueId'] },
    });

    dbJobs.forEach((j) => {
      expect(j.status).to.equal('COMPLETED');
      expect(j.exit_code).to.equal(0);
    });
  });

  it('should fail job on timeout', async () => {
    const job = await queue.add('timeout-job', 'sleep', ['10'], { timeout: 1 });

    sandbox.stub(RemoteExecutor.prototype, 'connect').resolves();

    sandbox.stub(RemoteExecutor.prototype, 'disconnect').resolves();

    sandbox.stub(RemoteExecutor.prototype, 'testConnection').resolves(true);

    sandbox.stub(RemoteExecutor.prototype, 'getServerInfo').resolves({
      hostname: 'test-server',
      uptime: 'up 1 day',
    });

    sandbox
      .stub(RemoteExecutor.prototype, 'executeJobWithTimeout')
      .rejects(new Error('Job timed out after 1 seconds'));

    const worker = new Worker(
      queue,
      {
        queueName: 'concurrent-queue',
        workerConcurrency: 1,
        pollIntervalMs: 500,
        stalledTimeoutMs: 30000,
      },
      {
        ssh: {
          host: 'localhost',
          username: 'user',
          password: 'password',
        },
      }
    );

    let failed: Job | null = null;
    worker.on('jobFailed', (job) => {
      failed = job;
    });

    // Start worker without awaiting - it runs in an infinite loop
    worker.start().catch(console.error);

    // Wait for worker to process the job
    await new Promise((r) => setTimeout(r, 2000));
    await worker.stop();

    expect(failed).to.not.be.null;

    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).to.equal('FAILED');
  });
});

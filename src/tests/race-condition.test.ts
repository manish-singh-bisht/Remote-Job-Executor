import { expect } from 'chai';
import { describe, it, beforeEach, afterEach, after } from 'mocha';
import sinon from 'sinon';
import prisma from '../lib/prisma';
import { Queue } from '../classes/queue';
import { Worker } from '../classes/worker';
import { Job } from '../classes/job';
import { RemoteExecutor } from '../classes/remote-executor';
import { closePgClient } from '../lib/pg';

// race condition are non-deterministic, so we this test ensures that only one worker processes a job in an environment that may have race condition
describe('Race condition test', () => {
  let queue: Queue;
  let sandbox: sinon.SinonSandbox;
  let events: string[] = [];

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    events = [];

    await prisma.jobLog.deleteMany();
    await prisma.job.deleteMany();
    await prisma.queue.deleteMany();

    queue = new Queue('race-test');
    await queue.createQueue();
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(async () => {
    await closePgClient();
    await prisma.$disconnect();
  });

  it('should ensure only one worker processes a job (race condition test)', async () => {
    // Add a single job that all workers will compete to process
    const job = await queue.add('race-job', 'echo', ['race']);

    // Stub all RemoteExecutor methods to avoid actual SSH
    sandbox.stub(RemoteExecutor.prototype, 'connect').resolves();
    sandbox.stub(RemoteExecutor.prototype, 'disconnect').resolves();
    sandbox.stub(RemoteExecutor.prototype, 'testConnection').resolves(true);
    sandbox.stub(RemoteExecutor.prototype, 'getServerInfo').resolves({
      hostname: 'localhost',
      uptime: 'up 1 day',
    });

    // Simulate a long-running job to increase collision probability
    sandbox
      .stub(RemoteExecutor.prototype, 'executeJobWithTimeout')
      .callsFake(async (job: Job) => {
        await new Promise((res) => setTimeout(res, 500));
        return {
          exitCode: 0,
          stdout: 'done',
          stderr: '',
          duration: 500,
        };
      });

    // Create 2 competing workers
    const workers = [1, 2].map((i) => {
      const worker = new Worker(
        queue,
        {
          queueName: 'race-test',
          workerConcurrency: 1,
          pollIntervalMs: 10, // very small interval to increase chance of race condition
          stalledTimeoutMs: 60000,
        },
        {
          ssh: {
            host: 'localhost',
            username: 'test',
            password: 'password',
          },
        }
      );

      worker.on('jobStarted', () => {
        events.push(`worker${i}`);
      });

      return worker;
    });

    workers.forEach((w) => w.start().catch(console.error));

    // Wait for the job to be picked and completed
    await new Promise((res) => setTimeout(res, 1000));

    await Promise.all(workers.map((w) => w.stop()));

    expect(events.length).to.equal(1, 'Only one worker should process the job');
    expect(events[0]).to.match(
      /worker[1-2]/,
      'The job should be handled by a single worker'
    );

    const jobInDb = await prisma.job.findUnique({ where: { id: job.id } });
    expect(jobInDb?.status).to.equal(
      'COMPLETED',
      'Job should be marked as COMPLETED'
    );
  });
});

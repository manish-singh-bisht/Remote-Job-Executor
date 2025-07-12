import { expect } from 'chai';
import { describe, it, beforeEach, after } from 'mocha';
import prisma from '../src/lib/prisma';
import { Queue } from '../src/classes/queue';
import { JobStatus } from '../generated/prisma';
import { v4 as uuidv4 } from 'uuid';
import { closePgClient } from '../src/lib/pg';

describe('Job & Queue Integration', () => {
  let queue: Queue;

  beforeEach(async () => {
    await prisma.jobLog.deleteMany();
    await prisma.job.deleteMany();
    await prisma.queue.deleteMany();

    queue = new Queue('test-queue', {
      defaultJobOptions: {
        maxAttempts: 2,
        priority: 5,
        timeout: 10,
      },
    });
    await queue.createQueue();
  });

  after(async () => {
    await closePgClient();
    await prisma.$disconnect();
  });

  it('should create a queue and add a job', async () => {
    const job = await queue.add('echo-job', 'echo', ['hello']);

    expect(job).to.have.property('id');
    expect(job.status).to.equal(JobStatus.PENDING);
    expect(job.command).to.equal('echo');
    expect(job.args).to.deep.equal(['hello']);
  });

  it('should transition job to RUNNING', async () => {
    const job = await queue.add('run-job', 'echo', ['running']);
    await job.moveToRunning(uuidv4());

    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).to.equal(JobStatus.RUNNING);
    expect(dbJob?.lock_token).to.not.be.null;
    expect(dbJob?.processed_on).to.not.be.null;
  });

  it('should complete a job successfully', async () => {
    const job = await queue.add('complete-job', 'echo', ['done']);
    await job.moveToRunning(uuidv4());
    await job.moveToCompleted(0, 'stdout-ok', '');

    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).to.equal(JobStatus.COMPLETED);
    expect(dbJob?.exit_code).to.equal(0);
    expect(dbJob?.std_out).to.equal('stdout-ok');
  });

  it('should fail a job and retry if maxAttempts not reached', async () => {
    const job = await queue.add('fail-job', 'invalid-cmd');
    await job.moveToRunning(uuidv4());

    const error = new Error('Command failed');
    await job.moveToFailed(error, 127, '', '');

    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).to.equal(JobStatus.PENDING);
    expect(dbJob?.attempts_made).to.equal(1);
  });

  it('should fail a job permanently after max attempts', async () => {
    const job = await queue.add('perma-fail-job', 'invalid');
    job.attemptsMade = 2; // Simulate already retried
    await job.moveToRunning(uuidv4());

    const error = new Error('Still failed');
    await job.moveToFailed(error, 127, '', '');

    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).to.equal(JobStatus.FAILED);
    expect(dbJob?.exit_code).to.equal(127);
    expect(dbJob?.failed_reason).to.include('Still failed');
  });

  it('should add and trim logs correctly', async () => {
    const job = await queue.add('log-job', 'echo', []);
    job.keepLogs = 3;
    await job.save();

    for (let i = 1; i <= 5; i++) {
      await job.addLog(`log ${i}`);
    }

    const logs = await job.getLogs();
    expect(logs.length).to.equal(3);
    expect(logs[0].message).to.include('log 3');
  });

  it('should mark stalled jobs and allow retry', async () => {
    const job = await queue.add('stalled-job', 'echo', []);
    await job.moveToRunning('stalled-token');

    // Backdate processed_on to simulate stall
    await prisma.job.update({
      where: { id: job.id },
      data: { processed_on: new Date(Date.now() - 100000) },
    });

    await queue.markStalledJobs(5000);

    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).to.equal(JobStatus.STALLED);

    await queue.retryStalledJobs();

    const retried = await prisma.job.findUnique({ where: { id: job.id } });
    expect(retried?.status).to.equal(JobStatus.PENDING);
  });
});

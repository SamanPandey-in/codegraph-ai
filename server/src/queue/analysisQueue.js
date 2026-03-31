import { Queue, Worker } from 'bullmq';
import { SupervisorAgent } from '../agents/core/SupervisorAgent.js';
import { pgPool, redisClient } from '../infrastructure/connections.js';

const queueConcurrency = Number(process.env.QUEUE_CONCURRENCY || 3);

let analysisQueue;
let analysisWorker;

function buildQueue() {
  return new Queue('code-analysis', {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

function buildWorker() {
  const worker = new Worker(
    'code-analysis',
    async (job) => {
      const supervisor = new SupervisorAgent({
        db: pgPool,
        redis: redisClient,
      });

      return supervisor.runPipeline(job.data.jobId, job.data.input);
    },
    {
      connection: redisClient,
      concurrency: Number.isInteger(queueConcurrency) && queueConcurrency > 0 ? queueConcurrency : 3,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export function getAnalysisQueue() {
  if (!analysisQueue) {
    analysisQueue = buildQueue();
  }

  return analysisQueue;
}

export function startAnalysisWorker() {
  if (!analysisWorker) {
    analysisWorker = buildWorker();
  }

  return analysisWorker;
}

export async function closeAnalysisQueueResources() {
  if (analysisWorker) {
    await analysisWorker.close();
    analysisWorker = undefined;
  }

  if (analysisQueue) {
    await analysisQueue.close();
    analysisQueue = undefined;
  }
}

export async function enqueueAnalysisJob({ jobId, input }) {
  if (!jobId) {
    const err = new Error('enqueueAnalysisJob requires jobId');
    err.statusCode = 400;
    throw err;
  }

  return getAnalysisQueue().add(
    'analyze',
    { jobId, input },
    {
      jobId,
    },
  );
}

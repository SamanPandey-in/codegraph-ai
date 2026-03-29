import { Queue, Worker } from 'bullmq';
import { SupervisorAgent } from '../agents/core/SupervisorAgent.js';
import { pgPool, redisClient } from '../infrastructure/connections.js';

const queueConcurrency = Number(process.env.QUEUE_CONCURRENCY || 3);

export const analysisQueue = new Queue('code-analysis', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const analysisWorker = new Worker(
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

analysisWorker.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job?.id} failed:`, err.message);
});

export async function enqueueAnalysisJob({ jobId, input }) {
  if (!jobId) {
    const err = new Error('enqueueAnalysisJob requires jobId');
    err.statusCode = 400;
    throw err;
  }

  return analysisQueue.add(
    'analyze',
    { jobId, input },
    {
      jobId,
    },
  );
}

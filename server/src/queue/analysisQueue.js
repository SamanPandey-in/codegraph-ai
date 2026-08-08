import { Queue, Worker } from 'bullmq';
import { logger } from '../utils/logger.js';
import { SupervisorAgent } from '../agents/core/SupervisorAgent.js';
import { pgPool, redisClient } from '../infrastructure/connections.js';
import { postImpactCommentForJob } from '../api/webhooks/pr-comment.routes.js';

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
      const jobLogger = logger.child({ jobId: job.data.jobId });
      const supervisor = new SupervisorAgent({
        db: pgPool,
        redis: redisClient,
        logger: jobLogger,
      });

      return supervisor.runPipeline(job.data.jobId, job.data.input);
    },
    {
      connection: redisClient,
      concurrency: Number.isInteger(queueConcurrency) && queueConcurrency > 0 ? queueConcurrency : 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({
      jobId: job?.id,
      input: job?.data?.input ? { source: job.data.input.source } : null,
      error: err.message,
      stack: err.stack,
      attemptsMade: job?.attemptsMade,
    }, 'analysis_job_failed');
  });

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id }, 'analysis_job_completed');

    // Best-effort PR enrichment: only meaningful for jobs that actually
    // finished successfully. Fire-and-forget — a comment-posting failure
    // (bad token, GitHub outage, PR closed mid-analysis) must never affect
    // the job's own completion status, which has already been persisted.
    if (result?.status === 'completed') {
      postImpactCommentForJob(job.data.jobId).catch((error) => {
        logger.error({ jobId: job.data.jobId, error: error.message }, 'github_pr_impact_comment_unhandled_error');
      });
    }
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

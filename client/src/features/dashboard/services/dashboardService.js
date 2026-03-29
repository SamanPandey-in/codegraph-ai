import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

const dashboardClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const normalizeRepository = (raw) => {
  const source = String(raw?.source ?? raw?.analysisSource ?? 'unknown').toLowerCase();
  const githubMode =
    raw?.githubMode ??
    raw?.github?.mode ??
    (raw?.mode === 'owned' || raw?.mode === 'public' ? raw.mode : null);

  let sourceCategory = 'unknown';

  if (source === 'local') sourceCategory = 'local';
  if (source === 'public') sourceCategory = 'github-public';
  if (source === 'owned') sourceCategory = 'github-owned';
  if (source === 'github' && githubMode === 'public') sourceCategory = 'github-public';
  if (source === 'github' && githubMode === 'owned') sourceCategory = 'github-owned';

  return {
    id: raw?.id ?? raw?._id ?? `${raw?.owner ?? 'unknown'}/${raw?.name ?? 'repository'}`,
    jobId:
      raw?.jobId ??
      raw?.job_id ??
      raw?.latestCompletedJobId ??
      raw?.latest_completed_job_id ??
      raw?.graphJobId ??
      raw?.graph_job_id ??
      null,
    latestJobId: raw?.latestJobId ?? raw?.latest_job_id ?? null,
    name: raw?.name ?? raw?.repo ?? 'Unknown repository',
    owner: raw?.owner ?? raw?.organization ?? 'Unknown owner',
    fullName:
      raw?.fullName ??
      raw?.repositoryFullName ??
      (raw?.owner && raw?.name ? `${raw.owner}/${raw.name}` : null),
    source,
    sourceCategory,
    githubMode,
    branch: raw?.branch ?? raw?.defaultBranch ?? raw?.latestJob?.branch ?? null,
    commitSha: raw?.commitSha ?? raw?.commit ?? null,
    analyzedAt:
      raw?.analyzedAt ??
      raw?.latestJob?.analyzedAt ??
      raw?.lastScannedAt ??
      raw?.updatedAt ??
      raw?.createdAt ??
      null,
    nodeCount:
      Number.isFinite(raw?.nodeCount)
        ? raw.nodeCount
        : Number.isFinite(raw?.latestJob?.nodeCount)
          ? raw.latestJob.nodeCount
          : null,
    edgeCount:
      Number.isFinite(raw?.edgeCount)
        ? raw.edgeCount
        : Number.isFinite(raw?.latestJob?.edgeCount)
          ? raw.latestJob.edgeCount
          : null,
    scanCount: Number.isFinite(raw?.scanCount) ? raw.scanCount : 0,
    lastScannedAt: raw?.lastScannedAt ?? null,
    latestConfidence: raw?.latestJob?.confidence ?? null,
    language: raw?.language ?? null,
    visibility: raw?.visibility ?? null,
    status: raw?.status ?? raw?.latestJob?.status ?? 'completed',
  };
};

const normalizePayload = (payload) => {
  const repositories = Array.isArray(payload?.repositories)
    ? payload.repositories.map(normalizeRepository)
    : [];

  const totalAnalyzed =
    Number.isFinite(payload?.summary?.totalAnalyzed)
      ? payload.summary.totalAnalyzed
      : repositories.length;

  const lastAnalyzedAt =
    payload?.summary?.lastAnalyzedAt ?? repositories?.[0]?.analyzedAt ?? null;

  return {
    repositories,
    summary: {
      totalAnalyzed,
      lastAnalyzedAt,
      uniqueOwners:
        Number.isFinite(payload?.summary?.uniqueOwners)
          ? payload.summary.uniqueOwners
          : new Set(repositories.map((repo) => repo.owner)).size,
    },
  };
};

export const dashboardService = {
  async getAnalyzedRepositories({ userId, page = 1, limit = 25 } = {}) {
    const { data } = await dashboardClient.get('/api/repositories', {
      params: {
        page,
        limit,
      },
    });

    return normalizePayload(data);
  },

  async getRepositoryJobs({ repositoryId, page = 1, limit = 20 } = {}) {
    const { data } = await dashboardClient.get(`/api/repositories/${repositoryId}/jobs`, {
      params: { page, limit },
    });

    return {
      repository: data?.repository ?? null,
      jobs: Array.isArray(data?.jobs)
        ? data.jobs.map((job) => ({
            id: job?.id,
            branch: job?.branch ?? null,
            status: job?.status ?? 'unknown',
            confidence: job?.confidence ?? null,
            fileCount: Number.isFinite(job?.fileCount) ? job.fileCount : null,
            nodeCount: Number.isFinite(job?.nodeCount) ? job.nodeCount : null,
            edgeCount: Number.isFinite(job?.edgeCount) ? job.edgeCount : null,
            errorSummary: job?.errorSummary ?? null,
            startedAt: job?.startedAt ?? null,
            completedAt: job?.completedAt ?? null,
            createdAt: job?.createdAt ?? null,
          }))
        : [],
      pagination: data?.pagination ?? null,
    };
  },
};

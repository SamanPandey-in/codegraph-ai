import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : 'http://localhost:5000/api';

const dashboardClient = axios.create({
  baseURL: BASE_URL,
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
    name: raw?.name ?? raw?.repo ?? 'Unknown repository',
    owner: raw?.owner ?? raw?.organization ?? 'Unknown owner',
    fullName:
      raw?.fullName ??
      raw?.repositoryFullName ??
      (raw?.owner && raw?.name ? `${raw.owner}/${raw.name}` : null),
    source,
    sourceCategory,
    githubMode,
    branch: raw?.branch ?? raw?.defaultBranch ?? null,
    commitSha: raw?.commitSha ?? raw?.commit ?? null,
    analyzedAt: raw?.analyzedAt ?? raw?.updatedAt ?? raw?.createdAt ?? null,
    nodeCount: Number.isFinite(raw?.nodeCount) ? raw.nodeCount : null,
    edgeCount: Number.isFinite(raw?.edgeCount) ? raw.edgeCount : null,
    language: raw?.language ?? null,
    visibility: raw?.visibility ?? null,
    status: raw?.status ?? 'completed',
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
    const { data } = await dashboardClient.get('/analyze/history', {
      params: {
        page,
        limit,
        ...(userId ? { userId } : {}),
      },
    });

    return normalizePayload(data);
  },
};

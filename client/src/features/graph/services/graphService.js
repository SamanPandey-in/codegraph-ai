import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

const graphClient = axios.create({
  baseURL:         apiBaseUrl,
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
});

function resolveApiUrl(pathname) {
  const baseUrl = apiBaseUrl && apiBaseUrl.trim()
    ? apiBaseUrl
    : window.location.origin;

  return new URL(pathname, baseUrl).toString();
}

function toStreamError(payload, fallbackMessage) {
  const error = new Error(payload?.errorSummary || payload?.error || fallbackMessage);
  error.payload = payload;
  return error;
}

export const graphService = {
  analyze: async (config) => {
    const { data } = await graphClient.post('/api/analyze', config);
    return data;
  },

  waitForJobCompletion: async (jobId, { onUpdate, signal } = {}) => {
    if (!jobId) {
      throw new Error('A jobId is required to stream analysis progress.');
    }

    return await new Promise((resolve, reject) => {
      const stream = new EventSource(resolveApiUrl(`/api/jobs/${jobId}/stream`), {
        withCredentials: true,
      });

      let settled = false;

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        stream.close();
        callback();
      };

      const handlePayload = (payload) => {
        onUpdate?.(payload);

        if (payload?.status === 'completed') {
          finish(() => resolve(payload));
          return;
        }

        if (payload?.status === 'failed' || payload?.status === 'partial') {
          finish(() => reject(toStreamError(payload, 'Analysis job did not complete successfully.')));
        }
      };

      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handlePayload(payload);
        } catch {
          finish(() => reject(new Error('Received an invalid analysis status update.')));
        }
      };

      stream.onerror = () => {
        finish(() => reject(new Error('Lost connection while waiting for analysis progress.')));
      };

      signal?.addEventListener(
        'abort',
        () => {
          finish(() => reject(new Error('Analysis was cancelled.')));
        },
        { once: true },
      );
    });
  },

  getGraph: async (jobId) => {
    const { data } = await graphClient.get(`/api/graph/${jobId}`);
    return data;
  },

  validateLocalPath: async (projectPath) => {
    const { data } = await graphClient.post('/api/analyze/local/validate', {
      path: projectPath.trim(),
    });
    return data;
  },

  getLocalPickerCapabilities: async () => {
    const { data } = await graphClient.get('/api/analyze/local/picker-capabilities');
    return data;
  },

  browseLocalPath: async () => {
    const { data } = await graphClient.get('/api/analyze/local/browse', {
      timeout: 22000,
    });
    return data;
  },

  resolvePublicRepo: async (repoUrl) => {
    const { data } = await graphClient.post('/api/analyze/github/public/resolve', {
      url: repoUrl.trim(),
    });
    return data;
  },

  getOwnedRepos: async () => {
    const { data } = await graphClient.get('/api/analyze/github/repos');
    return data;
  },

  getRepoBranches: async ({ owner, repo, url, source = 'public' }) => {
    const params = { source };

    if (owner && repo) {
      params.owner = owner;
      params.repo = repo;
    }

    if (url) params.url = url;

    const { data } = await graphClient.get('/api/analyze/github/branches', {
      params,
    });

    return data;
  },
};

import axios from 'axios';

const graphClient = axios.create({
  baseURL:         import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
});

export const graphService = {
  analyze: async (config) => {
    const { data } = await graphClient.post('/api/analyze', config);
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
      timeout: 125000,
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

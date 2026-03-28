import axios from 'axios';

const graphClient = axios.create({
  baseURL:         import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
});

export const graphService = {
  analyze: async (projectPath) => {
    const { data } = await graphClient.post('/api/analyze', {
      path: projectPath.trim(),
    });
    return data;
  },
};

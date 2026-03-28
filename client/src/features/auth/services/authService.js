import axios from 'axios';

export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : 'http://localhost:5000/api';

const API_ORIGIN = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

export const authService = {
  loginWithGithub(pathOrUrl = '/auth/github') {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      window.location.href = pathOrUrl;
      return;
    }

    if (pathOrUrl.startsWith('/api/')) {
      window.location.href = `${API_ORIGIN}${pathOrUrl}`;
      return;
    }

    if (pathOrUrl.startsWith('/')) {
      window.location.href = `${BASE_URL}${pathOrUrl}`;
      return;
    }

    window.location.href = `${BASE_URL}/auth/github`;
  },

  logout: () => apiClient.post('/auth/logout'),

  getCurrentUser: () => apiClient.get('/auth/me'),
};

export default apiClient;

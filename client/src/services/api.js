import axios from 'axios';

export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

const API_URL = import.meta.env.VITE_API_BASE_URL 
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  getGithubAuthUrl: () => api.get('/auth/github'),
  logout: () => api.post('/auth/logout'),
};

export const userAPI = {
  getCurrentUser: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/users/update', data),
  getAll: (params) => api.get('/users', { params }),
};

export default api;

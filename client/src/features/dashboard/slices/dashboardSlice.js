import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { dashboardService } from '../services/dashboardService';

export const fetchAnalyzedRepositories = createAsyncThunk(
  'dashboard/fetchAnalyzedRepositories',
  async ({ userId, page = 1, limit = 25 } = {}, { rejectWithValue }) => {
    try {
      return await dashboardService.getAnalyzedRepositories({ userId, page, limit });
    } catch (err) {
      const status = err?.response?.status;
      const backendError = err?.response?.data?.error;

      if (status === 404 || status === 501) {
        return rejectWithValue({
          code: 'NOT_READY',
          message: 'Repository history endpoint is not available yet.',
        });
      }

      return rejectWithValue({
        code: 'REQUEST_FAILED',
        message: backendError || err?.message || 'Failed to load analyzed repositories.',
      });
    }
  },
);

export const fetchRepositoryJobs = createAsyncThunk(
  'dashboard/fetchRepositoryJobs',
  async ({ repositoryId, page = 1, limit = 20 } = {}, { rejectWithValue }) => {
    try {
      const payload = await dashboardService.getRepositoryJobs({ repositoryId, page, limit });
      return {
        repositoryId,
        ...payload,
      };
    } catch (err) {
      const backendError = err?.response?.data?.error;
      return rejectWithValue({
        repositoryId,
        code: 'REQUEST_FAILED',
        message: backendError || err?.message || 'Failed to load repository job history.',
      });
    }
  },
);

export const toggleRepositoryStar = createAsyncThunk(
  'dashboard/toggleRepositoryStar',
  async ({ repositoryId } = {}, { rejectWithValue }) => {
    try {
      return await dashboardService.toggleStar(repositoryId);
    } catch (err) {
      const backendError = err?.response?.data?.error;
      return rejectWithValue({
        repositoryId,
        code: 'REQUEST_FAILED',
        message: backendError || err?.message || 'Failed to update repository star.',
      });
    }
  },
);

const initialState = {
  repositories: [],
  summary: {
    totalAnalyzed: 0,
    lastAnalyzedAt: null,
    uniqueOwners: 0,
  },
  status: 'idle',
  error: null,
  repositoryJobsById: {},
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAnalyzedRepositories.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAnalyzedRepositories.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.repositories = action.payload.repositories;
        state.summary = action.payload.summary;
        state.error = null;
      })
      .addCase(fetchAnalyzedRepositories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || {
          code: 'UNKNOWN',
          message: 'Could not load analyzed repositories.',
        };
      })
      .addCase(fetchRepositoryJobs.pending, (state, action) => {
        const repositoryId = action.meta.arg?.repositoryId;
        if (!repositoryId) return;

        state.repositoryJobsById[repositoryId] = {
          ...(state.repositoryJobsById[repositoryId] || {}),
          status: 'loading',
          error: null,
        };
      })
      .addCase(fetchRepositoryJobs.fulfilled, (state, action) => {
        const { repositoryId, repository, jobs, pagination } = action.payload;
        if (!repositoryId) return;

        state.repositoryJobsById[repositoryId] = {
          status: 'succeeded',
          error: null,
          repository: repository || null,
          jobs: jobs || [],
          pagination: pagination || null,
        };
      })
      .addCase(fetchRepositoryJobs.rejected, (state, action) => {
        const repositoryId = action.payload?.repositoryId || action.meta.arg?.repositoryId;
        if (!repositoryId) return;

        state.repositoryJobsById[repositoryId] = {
          ...(state.repositoryJobsById[repositoryId] || {}),
          status: 'failed',
          error: action.payload || {
            code: 'UNKNOWN',
            message: 'Could not load repository jobs.',
          },
        };
      })
      .addCase(toggleRepositoryStar.pending, (state, action) => {
        const repositoryId = action.meta.arg?.repositoryId;
        if (!repositoryId) return;

        const repository = state.repositories.find((repo) => repo.id === repositoryId);
        if (repository) {
          repository.isStarred = !repository.isStarred;
        }
      })
      .addCase(toggleRepositoryStar.fulfilled, (state, action) => {
        const repositoryId = action.payload?.id;
        if (!repositoryId) return;

        const repository = state.repositories.find((repo) => repo.id === repositoryId);
        if (repository) {
          repository.isStarred = Boolean(action.payload.isStarred);
        }
      })
      .addCase(toggleRepositoryStar.rejected, (state, action) => {
        const repositoryId = action.payload?.repositoryId || action.meta.arg?.repositoryId;
        if (!repositoryId) return;

        const repository = state.repositories.find((repo) => repo.id === repositoryId);
        if (repository) {
          repository.isStarred = !repository.isStarred;
        }
      });
  },
});

export const selectDashboardStatus = (state) => state.dashboard.status;
export const selectDashboardError = (state) => state.dashboard.error;
export const selectAnalyzedRepositories = (state) => state.dashboard.repositories;
export const selectDashboardSummary = (state) => state.dashboard.summary;
export const selectRepositoryJobsById = (state) => state.dashboard.repositoryJobsById;

export default dashboardSlice.reducer;

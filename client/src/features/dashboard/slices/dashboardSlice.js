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

const initialState = {
  repositories: [],
  summary: {
    totalAnalyzed: 0,
    lastAnalyzedAt: null,
    uniqueOwners: 0,
  },
  status: 'idle',
  error: null,
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
      });
  },
});

export const selectDashboardStatus = (state) => state.dashboard.status;
export const selectDashboardError = (state) => state.dashboard.error;
export const selectAnalyzedRepositories = (state) => state.dashboard.repositories;
export const selectDashboardSummary = (state) => state.dashboard.summary;

export default dashboardSlice.reducer;

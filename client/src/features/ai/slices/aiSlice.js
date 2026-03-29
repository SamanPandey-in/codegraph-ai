import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { aiService } from '../services/aiService';

function buildErrorPayload(err, fallbackMessage) {
  return {
    code: err?.response?.status ? `HTTP_${err.response.status}` : 'REQUEST_FAILED',
    message: err?.response?.data?.error || err?.message || fallbackMessage,
  };
}

const initialAsyncState = {
  status: 'idle',
  error: null,
  data: null,
  lastRequest: null,
};

const initialState = {
  query: { ...initialAsyncState },
  explain: { ...initialAsyncState },
  impact: { ...initialAsyncState },
};

export const queryGraph = createAsyncThunk(
  'ai/queryGraph',
  async ({ question, jobId }, { rejectWithValue }) => {
    try {
      return await aiService.queryGraph({ question, jobId });
    } catch (err) {
      return rejectWithValue(buildErrorPayload(err, 'Failed to query repository graph.'));
    }
  },
);

export const explainNode = createAsyncThunk(
  'ai/explainNode',
  async ({ jobId, filePath, nodeLabel, question }, { rejectWithValue }) => {
    try {
      return await aiService.explainNode({ jobId, filePath, nodeLabel, question });
    } catch (err) {
      return rejectWithValue(buildErrorPayload(err, 'Failed to explain graph node.'));
    }
  },
);

export const analyzeImpact = createAsyncThunk(
  'ai/analyzeImpact',
  async ({ jobId, filePath }, { rejectWithValue }) => {
    try {
      return await aiService.analyzeImpact({ jobId, filePath });
    } catch (err) {
      return rejectWithValue(buildErrorPayload(err, 'Failed to analyze impact.'));
    }
  },
);

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    resetAiState(state) {
      state.query = { ...initialAsyncState };
      state.explain = { ...initialAsyncState };
      state.impact = { ...initialAsyncState };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(queryGraph.pending, (state, action) => {
        state.query.status = 'loading';
        state.query.error = null;
        state.query.lastRequest = action.meta.arg || null;
      })
      .addCase(queryGraph.fulfilled, (state, action) => {
        state.query.status = 'succeeded';
        state.query.data = action.payload;
        state.query.error = null;
      })
      .addCase(queryGraph.rejected, (state, action) => {
        state.query.status = 'failed';
        state.query.error = action.payload || {
          code: 'UNKNOWN',
          message: 'Could not query graph.',
        };
      })
      .addCase(explainNode.pending, (state, action) => {
        state.explain.status = 'loading';
        state.explain.error = null;
        state.explain.lastRequest = action.meta.arg || null;
      })
      .addCase(explainNode.fulfilled, (state, action) => {
        state.explain.status = 'succeeded';
        state.explain.data = action.payload;
        state.explain.error = null;
      })
      .addCase(explainNode.rejected, (state, action) => {
        state.explain.status = 'failed';
        state.explain.error = action.payload || {
          code: 'UNKNOWN',
          message: 'Could not explain node.',
        };
      })
      .addCase(analyzeImpact.pending, (state, action) => {
        state.impact.status = 'loading';
        state.impact.error = null;
        state.impact.lastRequest = action.meta.arg || null;
      })
      .addCase(analyzeImpact.fulfilled, (state, action) => {
        state.impact.status = 'succeeded';
        state.impact.data = action.payload;
        state.impact.error = null;
      })
      .addCase(analyzeImpact.rejected, (state, action) => {
        state.impact.status = 'failed';
        state.impact.error = action.payload || {
          code: 'UNKNOWN',
          message: 'Could not analyze impact.',
        };
      });
  },
});

export const { resetAiState } = aiSlice.actions;

export const selectAiQueryState = (state) => state.ai.query;
export const selectAiExplainState = (state) => state.ai.explain;
export const selectAiImpactState = (state) => state.ai.impact;
export const selectHighlightedNodeIds = (state) => {
  const queryHighlights = state.ai?.query?.data?.highlightedFiles || [];
  const impactHighlights = state.ai?.impact?.data?.affectedFiles || [];
  return Array.from(new Set([...queryHighlights, ...impactHighlights]));
};
export const selectDeadFiles = (state) =>
  state.graph?.data?.topology?.deadCodeCandidates || [];

export default aiSlice.reducer;

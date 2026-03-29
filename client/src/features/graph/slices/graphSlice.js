import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { graphService } from '../services/graphService';

function describeAnalysisTarget(analyzeConfig) {
  if (analyzeConfig?.source === 'local') {
    return analyzeConfig.localPath;
  }

  const github = analyzeConfig?.github || {};
  const repository = github.owner && github.repo
    ? `${github.owner}/${github.repo}`
    : github.url || 'GitHub repository';

  return github.branch ? `github:${repository}#${github.branch}` : `github:${repository}`;
}

export const analyzeCodebase = createAsyncThunk(
  'graph/analyzeCodebase',
  async (analyzeConfig, { dispatch, rejectWithValue, signal }) => {
    try {
      const queuedJob = await graphService.analyze(analyzeConfig);
      const jobId = queuedJob?.jobId;

      if (!jobId) {
        throw new Error('Analysis job was created without a job id.');
      }

      dispatch(updateAnalysisJob({ jobId, status: 'queued' }));

      const job = await graphService.waitForJobCompletion(jobId, {
        signal,
        onUpdate: (payload) => {
          dispatch(updateAnalysisJob(payload));
        },
      });

      const rootDir = describeAnalysisTarget(analyzeConfig);
      const fileCount = Number.isFinite(job?.fileCount) ? job.fileCount : 0;

      if ((job?.nodeCount || 0) === 0) {
        return {
          jobId,
          job,
          rootDir,
          fileCount,
          graph: {},
          edges: [],
          topology: {
            nodeCount: 0,
            edgeCount: 0,
            deadCodeCandidates: [],
          },
          message: 'No JS/TS files found in the selected repository and branch.',
        };
      }

      const graph = await graphService.getGraph(jobId);

      return {
        ...graph,
        jobId,
        job,
        rootDir,
        fileCount,
      };
    } catch (err) {
      const message =
        err.payload?.errorSummary ||
        err.payload?.error ||
        err.response?.data?.error ||
        err.message ||
        'Analysis failed. Is the server running?';
      return rejectWithValue(message);
    }
  },
);

export const loadSavedGraph = createAsyncThunk(
  'graph/loadSavedGraph',
  async ({ jobId, rootDir = null, fileCount = null, analyzedAt = null } = {}, { rejectWithValue }) => {
    try {
      if (!jobId) {
        throw new Error('A job id is required to load a saved analysis graph.');
      }

      const graph = await graphService.getGraph(jobId);

      return {
        ...graph,
        jobId,
        rootDir: rootDir || graph?.rootDir || `saved-analysis:${jobId}`,
        fileCount:
          Number.isFinite(fileCount)
            ? fileCount
            : Number.isFinite(graph?.topology?.nodeCount)
              ? graph.topology.nodeCount
              : 0,
        analyzedAt,
        message: graph?.message || null,
        job: {
          jobId,
          status: 'completed',
          nodeCount: graph?.topology?.nodeCount ?? null,
          edgeCount: graph?.topology?.edgeCount ?? null,
        },
      };
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.message ||
        'Failed to load saved analysis graph.';
      return rejectWithValue(message);
    }
  },
);

const graphSlice = createSlice({
  name: 'graph',
  initialState: {
    data: null,
    job: null,
    selectedNodeId: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    updateAnalysisJob(state, action) {
      state.job = {
        ...(state.job || {}),
        ...action.payload,
      };
    },
    selectNode(state, action) {
      state.selectedNodeId = action.payload;
    },
    clearGraph(state) {
      state.data = null;
      state.job = null;
      state.selectedNodeId = null;
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(analyzeCodebase.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.data = null;
        state.job = null;
        state.selectedNodeId = null;
      })
      .addCase(analyzeCodebase.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.job = action.payload.job || state.job;
      })
      .addCase(analyzeCodebase.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(loadSavedGraph.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.selectedNodeId = null;
      })
      .addCase(loadSavedGraph.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.job = action.payload.job || state.job;
      })
      .addCase(loadSavedGraph.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const { updateAnalysisJob, selectNode, clearGraph } = graphSlice.actions;

export const selectGraphData = (state) => state.graph.data;
export const selectAnalysisJob = (state) => state.graph.job;
export const selectGraphStatus = (state) => state.graph.status;
export const selectGraphError = (state) => state.graph.error;
export const selectSelectedNodeId = (state) => state.graph.selectedNodeId;

export default graphSlice.reducer;

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { graphService } from '../services/graphService';

export const analyzeCodebase = createAsyncThunk(
  'graph/analyzeCodebase',
  async (projectPath, { rejectWithValue }) => {
    try {
      return await graphService.analyze(projectPath);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.message ||
        'Analysis failed. Is the server running?';
      return rejectWithValue(message);
    }
  },
);

const graphSlice = createSlice({
  name: 'graph',
  initialState: {
    data: null,
    selectedNodeId: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    selectNode(state, action) {
      state.selectedNodeId = action.payload;
    },
    clearGraph(state) {
      state.data = null;
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
        state.selectedNodeId = null;
      })
      .addCase(analyzeCodebase.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(analyzeCodebase.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const { selectNode, clearGraph } = graphSlice.actions;

export const selectGraphData = (state) => state.graph.data;
export const selectGraphStatus = (state) => state.graph.status;
export const selectGraphError = (state) => state.graph.error;
export const selectSelectedNodeId = (state) => state.graph.selectedNodeId;

export default graphSlice.reducer;

import { configureStore } from '@reduxjs/toolkit';
import themeReducer from '@/features/theme/slices/themeSlice';
import graphReducer from '@/features/graph/slices/graphSlice';
import dashboardReducer from '@/features/dashboard/slices/dashboardSlice';
import aiReducer from '@/features/ai/slices/aiSlice';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    graph: graphReducer,
    dashboard: dashboardReducer,
    ai: aiReducer,
  },
  devTools: import.meta.env.DEV,
});


import { configureStore } from '@reduxjs/toolkit';
import themeReducer from '@/features/theme/slices/themeSlice';
import graphReducer from '@/features/graph/slices/graphSlice';
import dashboardReducer from '@/features/dashboard/slices/dashboardSlice';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    graph: graphReducer,
    dashboard: dashboardReducer,
  },
  devTools: import.meta.env.DEV,
});


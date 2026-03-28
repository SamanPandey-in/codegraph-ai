import { configureStore } from '@reduxjs/toolkit';
import themeReducer from '@/features/theme/slices/themeSlice';
import graphReducer from '@/features/graph/slices/graphSlice';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    graph: graphReducer,
  },
  devTools: import.meta.env.DEV,
});


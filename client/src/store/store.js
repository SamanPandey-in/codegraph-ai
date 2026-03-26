// redux store configuration
import { configureStore } from "@reduxjs/toolkit";
import themeReducer from "./slices/themeSlice";

export const store = configureStore({
  reducer: {
    theme: themeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware(),
  
  // Optional: enable Redux DevTools automatically in dev
  devTools: import.meta.env.DEV,
});

export default store;
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // @/ maps to src/ — used throughout the codebase
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // All API traffic (auth + analyze) proxied to the Express server.
      // The old bare /analyze mount is gone — everything lives under /api now.
      '/api':    { target: 'http://localhost:5000', changeOrigin: true },
      '/health': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
})

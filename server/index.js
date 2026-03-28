/**
 * index.js — Process entry point.
 *
 * Configures dotenv exactly ONCE before any other module is imported,
 * then starts the HTTP server.
 */
import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
});

/**
 * app.js — Express application factory.
 *
 * Responsibilities:
 *   - Configure middleware (cors, cookies, body parsing, logging)
 *   - Mount feature routers under /api
 *   - Register shared 404 and error-handler middleware (always last)
 *
 * NOTE: dotenv is configured once, in index.js before this module is imported.
 */
import express    from 'express';
import cors       from 'cors';
import cookieParser from 'cookie-parser';
import passport   from 'passport';
import path       from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// Feature routers
import { analyzeRouter }                     from './src/analyze/index.js';
import { authRouter, configureGitHubPassport } from './src/auth/index.js';

// Shared middleware
import { requestLogger }  from './src/utils/logger.js';
import { notFound }       from './src/middleware/notFound.middleware.js';
import { errorHandler }   from './src/middleware/errorHandler.middleware.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const clientDistPath   = path.resolve(__dirname, '../client/dist');
const shouldServeClient =
  process.env.NODE_ENV === 'production' && existsSync(clientDistPath);

const app = express();

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin:      process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Passport (auth strategy must be configured before routes are hit)
// ---------------------------------------------------------------------------
app.use(passport.initialize());
configureGitHubPassport();

// ---------------------------------------------------------------------------
// Routes — all API routes live under /api for consistency
// ---------------------------------------------------------------------------

// Health check (outside /api so infra probes don't need auth)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Feature: Auth  →  /api/auth/...
app.use('/api/auth', authRouter);

// Feature: Analyze  →  /api/analyze  (was: /analyze — now consistent with auth)
app.use('/api/analyze', analyzeRouter);

// ---------------------------------------------------------------------------
// Production SPA fallback (must come after API routes)
// ---------------------------------------------------------------------------
if (shouldServeClient) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    // Let API and non-HTML requests fall through to the error handler
    if (!req.accepts('html')) return next();
    if (req.path.startsWith('/api')) return next();
    if (req.path === '/health') return next();
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Shared error handling — MUST be registered last
// ---------------------------------------------------------------------------
app.use(notFound);     // Generates a 404 error for unmatched routes
app.use(errorHandler); // Converts any error into a clean JSON response

export default app;

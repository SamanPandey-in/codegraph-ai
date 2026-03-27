import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { analyzeController } from './analyzeController.js';

const router = Router();

/** Limit analysis requests to 30 per minute per IP to prevent abuse. */
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before trying again.' },
});

// POST /analyze
router.post('/', analyzeLimiter, analyzeController);

export default router;

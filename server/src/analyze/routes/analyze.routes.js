import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateAnalyzeBody } from '../middleware/validate.middleware.js';
import { analyzeController }   from '../controllers/analyze.controller.js';

const router = Router();

const analyzeLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            30,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: 'Too many requests. Please wait a moment and try again.' },
});

router.post('/', analyzeLimiter, validateAnalyzeBody, analyzeController);

export default router;

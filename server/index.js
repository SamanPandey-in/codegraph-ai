import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { requestLogger } from './utils/logger.js';
import analyzeRouter from './routes/analyze.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Routes
app.use('/analyze', analyzeRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`codegraph-ai server running on http://localhost:${PORT}`);
});

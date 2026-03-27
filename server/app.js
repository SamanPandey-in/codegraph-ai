import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { requestLogger } from './src/utils/logger.js';
import { analyzeRouter } from './features/analyze/index.js';
import { authRouter, configureGitHubPassport } from './src/auth/index.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);

app.use(passport.initialize());

configureGitHubPassport();

app.use('/api/auth', authRouter);

// Feature: Analyze
app.use('/analyze', analyzeRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;

import { Router } from 'express';
import passport from 'passport';
import { getGitHubOAuthStatus } from '../middleware/passport.middleware.js';
import {
  getCurrentUser,
  handleGitHubCallback,
  logout,
} from '../controllers/auth.controller.js';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function ensureGitHubOAuthEnabled(req, res, next) {
  const oauthStatus = getGitHubOAuthStatus();

  if (oauthStatus.enabled) {
    return next();
  }

  return res.status(503).json({
    error: 'GitHub OAuth is not configured on the server.',
    missing: oauthStatus.missing,
  });
}

router.get(
  '/github',
  ensureGitHubOAuthEnabled,
  passport.authenticate('github', { scope: ['user:email'] }),
);

router.get(
  '/github/callback',
  ensureGitHubOAuthEnabled,
  passport.authenticate('github', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=oauth_failed`,
  }),
  handleGitHubCallback,
);

router.get('/me', getCurrentUser);

router.post('/logout', logout);

export default router;

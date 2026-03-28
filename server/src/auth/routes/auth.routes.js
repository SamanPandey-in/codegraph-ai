import { Router } from 'express';
import passport from 'passport';
import {
  getCurrentUser,
  handleGitHubCallback,
  logout,
} from '../controllers/auth.controller.js';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function getGitHubOauthScopes() {
  const raw = process.env.GITHUB_OAUTH_SCOPES || 'user:email,repo';
  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

router.get(
  '/github',
  (req, res, next) => {
    const scopes = getGitHubOauthScopes();
    const reauth = req.query.reauth === '1';

    const options = {
      scope: scopes,
      ...(reauth ? { authType: 'rerequest' } : {}),
    };

    return passport.authenticate('github', options)(req, res, next);
  },
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=oauth_failed`,
  }),
  handleGitHubCallback,
);

router.get('/me', getCurrentUser);

router.post('/logout', logout);

export default router;

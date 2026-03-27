import { Router } from 'express';
import passport from 'passport';
import { getCurrentUser, handleGitHubCallback, logout } from '../controllers/auth.controller.js';

const router = Router();
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: `${clientUrl}/login` }),
  handleGitHubCallback,
);

router.get('/me', getCurrentUser);
router.post('/logout', logout);

export default router;

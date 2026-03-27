import passport from 'passport';
import { createGitHubStrategy, validateGitHubOAuthEnv } from '../services/githubStrategy.service.js';

let initialized = false;

/** Configure Passport GitHub strategy exactly once. */
export function configureGitHubPassport() {
  if (initialized) return;

  const envCheck = validateGitHubOAuthEnv();
  if (!envCheck.valid) {
    console.warn(
      `[auth] GitHub OAuth disabled. Missing env vars: ${envCheck.missing.join(', ')}`,
    );
    return;
  }

  passport.use(createGitHubStrategy());
  initialized = true;

  console.log(`[auth] GitHub OAuth callback URL: ${envCheck.callbackURL}`);
}

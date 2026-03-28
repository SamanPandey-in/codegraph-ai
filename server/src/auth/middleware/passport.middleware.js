import passport from 'passport';
import { createGitHubStrategy, validateGitHubOAuthEnv } from '../services/githubStrategy.service.js';

let initialized = false;
let oauthStatus = {
  enabled: false,
  missing: [],
  callbackURL: null,
};

export function configureGitHubPassport() {
  if (initialized) return;

  const envCheck = validateGitHubOAuthEnv({ requireJwtSecret: false });
  oauthStatus = {
    enabled: envCheck.valid,
    missing: envCheck.missing,
    callbackURL: envCheck.callbackURL,
  };

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

export function getGitHubOAuthStatus() {
  return oauthStatus;
}

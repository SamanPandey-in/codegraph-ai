import { Strategy as GitHubStrategy } from 'passport-github2';

function getServerUrl() {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

function getGitHubCallbackUrl() {
  if (process.env.GITHUB_CALLBACK_URL) return process.env.GITHUB_CALLBACK_URL;
  return `${getServerUrl()}/api/auth/github/callback`;
}

function mapProfileToUser(profile, githubAccessToken) {
  return {
    id: profile.id,
    username: profile.username,
    email: profile.emails?.[0]?.value,
    avatar: profile.photos?.[0]?.value,
    role: 'USER',
    githubAccessToken,
  };
}

export function createGitHubStrategy() {
  return new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: getGitHubCallbackUrl(),
    },
    async (accessToken, _refreshToken, profile, done) => {
      try {
        const user = mapProfileToUser(profile, accessToken);
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  );
}

export function validateGitHubOAuthEnv({ requireJwtSecret = true } = {}) {
  const missing = [];

  if (!process.env.GITHUB_CLIENT_ID) missing.push('GITHUB_CLIENT_ID');
  if (!process.env.GITHUB_CLIENT_SECRET) missing.push('GITHUB_CLIENT_SECRET');
  if (requireJwtSecret && !process.env.JWT_SECRET) missing.push('JWT_SECRET');

  return {
    valid: missing.length === 0,
    missing,
    callbackURL: getGitHubCallbackUrl(),
  };
}

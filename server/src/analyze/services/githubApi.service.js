const GITHUB_API_BASE = 'https://api.github.com';

function getRequiredRepoScopes() {
  const raw = process.env.GITHUB_REQUIRED_SCOPES || process.env.GITHUB_OAUTH_SCOPES || 'repo';
  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function parseScopesHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return [];

  return headerValue
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function hasRequiredScopes(grantedScopes, requiredScopes) {
  if (!requiredScopes.length) return true;

  const granted = new Set(grantedScopes);

  return requiredScopes.every((required) => {
    if (required === 'repo') {
      return granted.has('repo');
    }
    return granted.has(required);
  });
}

function extractNextLink(linkHeader) {
  if (!linkHeader) return null;

  const parts = linkHeader.split(',').map((part) => part.trim());
  for (const part of parts) {
    const match = part.match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match && match[2] === 'next') {
      return match[1];
    }
  }

  return null;
}

function parseGitHubRateLimitError(response, context = 'GitHub API request') {
  if (response.status === 401) {
    const err = new Error('Failed authentication with GitHub. Please sign in again and retry.');
    err.statusCode = 401;
    throw err;
  }

  if (response.status === 403) {
    const err = new Error(`${context} was forbidden or rate-limited by GitHub. Retry later or re-authenticate with required permissions.`);
    err.statusCode = 403;
    throw err;
  }

  if (response.status === 404) {
    const err = new Error('Repository not found or inaccessible.');
    err.statusCode = 404;
    throw err;
  }

  const err = new Error(`${context} failed with status ${response.status}.`);
  err.statusCode = response.status;
  throw err;
}

async function githubFetchRaw(urlOrPath, { token, headers = {} } = {}) {
  const targetUrl = urlOrPath.startsWith('http') ? urlOrPath : `${GITHUB_API_BASE}${urlOrPath}`;
  return fetch(targetUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codegraph-ai',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

async function githubFetch(pathname, options = {}) {
  const response = await githubFetchRaw(pathname, options);

  if (!response.ok) {
    parseGitHubRateLimitError(response, `GitHub API request (${pathname})`);
  }

  return response.json();
}

export async function getTokenScopeInfo({ token }) {
  if (!token) {
    const err = new Error('GitHub authentication required. Please log in with GitHub.');
    err.statusCode = 401;
    throw err;
  }

  const response = await githubFetchRaw('/user', { token });

  if (!response.ok) {
    parseGitHubRateLimitError(response, 'GitHub token scope validation');
  }

  const grantedScopes = parseScopesHeader(response.headers.get('x-oauth-scopes'));
  const requiredScopes = getRequiredRepoScopes();
  const ok = hasRequiredScopes(grantedScopes, requiredScopes);

  return {
    ok,
    grantedScopes,
    requiredScopes,
  };
}

export function parseGitHubRepoUrl(repoUrl) {
  let parsed;

  try {
    parsed = new URL(repoUrl.trim());
  } catch {
    const err = new Error('Invalid GitHub repository URL format.');
    err.statusCode = 400;
    throw err;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    const err = new Error('Repository URL must be from github.com.');
    err.statusCode = 400;
    throw err;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    const err = new Error('Repository URL must include owner and repository name.');
    err.statusCode = 400;
    throw err;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');

  if (!owner || !repo) {
    const err = new Error('Repository URL must include owner and repository name.');
    err.statusCode = 400;
    throw err;
  }

  return { owner, repo };
}

export async function fetchRepoDetails({ owner, repo, token }) {
  const data = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    token,
  });

  return {
    owner: data.owner?.login || owner,
    repo: data.name || repo,
    fullName: data.full_name,
    defaultBranch: data.default_branch,
    private: Boolean(data.private),
  };
}

export async function fetchRepoBranches({ owner, repo, token }) {
  const data = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
    { token },
  );

  return data.map((branch) => ({
    name: branch.name,
    protected: Boolean(branch.protected),
  }));
}

export async function fetchOwnedRepositories({ token }) {
  if (!token) {
    const err = new Error('GitHub authentication required. Please log in with GitHub.');
    err.statusCode = 401;
    throw err;
  }

  const scopeInfo = await getTokenScopeInfo({ token });
  if (!scopeInfo.ok) {
    const err = new Error(
      `Insufficient GitHub permissions. Required scopes: ${scopeInfo.requiredScopes.join(', ')}. Re-authenticate and grant access.`,
    );
    err.statusCode = 403;
    err.code = 'INSUFFICIENT_SCOPE';
    err.requiredScopes = scopeInfo.requiredScopes;
    err.grantedScopes = scopeInfo.grantedScopes;
    throw err;
  }

  let nextUrl = `${GITHUB_API_BASE}/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100`;
  const allRepos = [];

  while (nextUrl) {
    const response = await githubFetchRaw(nextUrl, { token });

    if (!response.ok) {
      parseGitHubRateLimitError(response, 'GitHub repository listing');
    }

    const pageRepos = await response.json();
    if (Array.isArray(pageRepos)) {
      allRepos.push(...pageRepos);
    }

    const linkHeader = response.headers.get('link');
    nextUrl = extractNextLink(linkHeader);
  }

  const mapped = allRepos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login,
    defaultBranch: repo.default_branch,
    private: Boolean(repo.private),
    htmlUrl: repo.html_url,
  }));

  return {
    repositories: mapped,
    scopes: {
      required: scopeInfo.requiredScopes,
      granted: scopeInfo.grantedScopes,
    },
  };
}

export async function resolvePublicRepository(repoUrl) {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const details = await fetchRepoDetails({ owner, repo });
  const branches = await fetchRepoBranches({ owner: details.owner, repo: details.repo });

  return {
    repository: {
      owner: details.owner,
      repo: details.repo,
      fullName: details.fullName,
      private: details.private,
      defaultBranch: details.defaultBranch,
      htmlUrl: `https://github.com/${details.owner}/${details.repo}`,
    },
    branches,
  };
}

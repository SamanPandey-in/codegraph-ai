const GITHUB_API_BASE = 'https://api.github.com';

function parseGitHubRateLimitError(response) {
  if (response.status === 401) {
    const err = new Error('Failed authentication with GitHub. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }

  if (response.status === 403) {
    const err = new Error('GitHub API rate limit reached or access forbidden. Please try again later.');
    err.statusCode = 403;
    throw err;
  }

  if (response.status === 404) {
    const err = new Error('Repository not found or inaccessible.');
    err.statusCode = 404;
    throw err;
  }

  const err = new Error(`GitHub API request failed with status ${response.status}.`);
  err.statusCode = response.status;
  throw err;
}

async function githubFetch(pathname, { token, headers = {} } = {}) {
  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codegraph-ai',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    parseGitHubRateLimitError(response);
  }

  return response.json();
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

  const data = await githubFetch('/user/repos?affiliation=owner&sort=updated&per_page=100', {
    token,
  });

  return data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login,
    defaultBranch: repo.default_branch,
    private: Boolean(repo.private),
    htmlUrl: repo.html_url,
  }));
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

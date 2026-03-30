import axios from 'axios';

/**
 * GitHub PR Service
 * Handles GitHub API interactions for PR diff retrieval and comment posting
 */

class GitHubPRService {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.baseURL = 'https://api.github.com';

    if (this.token) {
      this.client = axios.create({
        baseURL: this.baseURL,
        headers: {
          Authorization: `token ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
    }
  }

  /**
   * Check if GitHub token is configured
   */
  isConfigured() {
    return !!this.token && !!this.client;
  }

  /**
   * Fetch PR diff from GitHub
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @returns {Promise<string>} Raw diff content
   */
  async getPRDiff(owner, repo, prNumber) {
    if (!this.isConfigured()) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN env var.');
    }

    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: { Accept: 'application/vnd.github.v3.diff' },
      });
      return response.data;
    } catch (err) {
      throw new Error(`Failed to fetch PR diff: ${err.message}`);
    }
  }

  /**
   * Parse diff to extract changed files
   * @param {string} diff - Raw diff content
   * @returns {Array<{file: string, status: string, additions: number, deletions: number}>}
   */
  parseDiff(diff) {
    const changedFiles = [];
    const lines = diff.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Matches: "diff --git a/path/file.js b/path/file.js"
      const match = lines[i].match(/^diff --git a\/(.*?) b\/(.*?)$/);
      if (!match) continue;

      const filePath = match[2];

      // Determine status by scanning forward until the next "diff --git" header
      // to avoid misidentifying files when multiple files have status markers
      let status = 'modified';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('diff --git ')) break;
        if (lines[j].startsWith('new file mode')) {
          status = 'added';
          break;
        }
        if (lines[j].startsWith('deleted file mode')) {
          status = 'deleted';
          break;
        }
      }

      changedFiles.push({
        file: filePath,
        status,
      });
    }

    return changedFiles;
  }

  /**
   * Format impact analysis as GitHub comment markdown
   * @param {Array<string>} changedFiles - Files changed in PR
   * @param {Array<string>} impactedFiles - Files affected by changes
   * @param {string} graphUrl - URL to the graph visualization
   * @returns {string} Markdown formatted comment
   */
  formatImpactComment(changedFiles, impactedFiles, graphUrl) {
    const truncate = (arr, limit = 20) =>
      arr.length > limit ? [...arr.slice(0, limit), `... and ${arr.length - limit} more`] : arr;

    const changedList = truncate(changedFiles)
      .map((f) => `- \`${f}\``)
      .join('\n');

    const impactedList =
      impactedFiles.length > 0
        ? truncate(impactedFiles)
            .map((f) => `- \`${f}\``)
            .join('\n')
        : 'No other files affected (isolated change)';

    const timestamp = new Date().toISOString();

    return `## 📊 CodeGraph Impact Analysis

**Generated:** ${timestamp}  
**Status:** ✅ Analysis Complete

### Changed Files (${changedFiles.length})
${changedList}

### Potentially Impacted Files (${impactedFiles.length})
${impactedList}

---
🔗 [View Full Graph](${graphUrl || '#'}) | Powered by CodeGraph AI`;
  }

  /**
   * Post comment to a pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @param {string} comment - Comment markdown
   * @returns {Promise<{id: number, url: string}>}
   */
  async postPRComment(owner, repo, prNumber, comment) {
    if (!this.isConfigured()) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN env var.');
    }

    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
        body: comment,
      });

      return {
        id: response.data.id,
        url: response.data.html_url,
      };
    } catch (err) {
      throw new Error(`Failed to post PR comment: ${err.message}`);
    }
  }

  /**
   * Update an existing PR comment
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} commentId - Comment ID
   * @param {string} comment - Updated comment markdown
   * @returns {Promise<{id: number, url: string}>}
   */
  async updatePRComment(owner, repo, commentId, comment) {
    if (!this.isConfigured()) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN env var.');
    }

    try {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
        body: comment,
      });

      return {
        id: response.data.id,
        url: response.data.html_url,
      };
    } catch (err) {
      throw new Error(`Failed to update PR comment: ${err.message}`);
    }
  }

  /**
   * Find existing CodeGraph comment on PR
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @returns {Promise<{id: number} | null>}
   */
  async findExistingComment(owner, repo, prNumber) {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${prNumber}/comments`);
      const comment = response.data.find((c) => c.body.includes('CodeGraph Impact Analysis'));
      return comment ? { id: comment.id } : null;
    } catch (err) {
      console.error('Failed to find existing comment:', err.message);
      return null;
    }
  }

  /**
   * Fetch PR metadata (for verification)
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @returns {Promise<{title, branch, author}>}
   */
  async getPRMetadata(owner, repo, prNumber) {
    if (!this.isConfigured()) {
      throw new Error('GitHub token not configured.');
    }

    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
      return {
        title: response.data.title,
        branch: response.data.head.ref,
        author: response.data.user.login,
      };
    } catch (err) {
      throw new Error(`Failed to fetch PR metadata: ${err.message}`);
    }
  }
}

export { GitHubPRService };
export default new GitHubPRService();

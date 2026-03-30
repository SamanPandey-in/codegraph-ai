# GitHub PR Integration — Section 8.2: Impact Analysis Comments

## Overview

When a pull request is analyzed, CodeGraph automatically posts a comment showing the code graph impact of the changes. This helps developers understand the scope of their modifications before merge.

## Architecture

```
GitHub PR opened/synchronized
     ↓
Webhook triggers (Section 8.1)
     ↓
Analysis job queued with PR metadata (owner, repo, prNumber)
     ↓
SupervisorAgent analyzes code (Section 2-4)
     ↓
Job completes → POST /api/webhooks/github/pr-comment
     ↓
Service fetches PR diff from GitHub API
     ↓
Parse changed files from diff
     ↓
Query graph: find files depending on changed files
     ↓
Format markdown comment
     ↓
Post/update comment on PR
     ↓
Log event to audit trail
```

## Components

### 1. GitHubPRService (`server/src/services/GitHubPRService.js`)

Handles all GitHub API interactions:

```js
import GitHubPRService from '../../services/GitHubPRService.js';

// Check if configured
if (GitHubPRService.isConfigured()) { ... }

// Fetch PR diff
const diff = await GitHubPRService.getPRDiff(owner, repo, prNumber);

// Parse changed files
const files = GitHubPRService.parseDiff(diff);
// Returns: [{file: 'src/auth.js', status: 'modified'}, ...]

// Format comment
const markdown = GitHubPRService.formatImpactComment(
  ['src/auth.js'],      // changed files
  ['src/api.js'],       // impacted files
  'http://localhost:5173/?jobId=123'  // graph url
);

// Post comment
const result = await GitHubPRService.postPRComment(owner, repo, prNumber, markdown);
// Returns: {id: 12345, url: 'https://github.com/.../issues/42#issuecomment-...'}

// Update existing comment
const updated = await GitHubPRService.updatePRComment(owner, repo, commentId, newMarkdown);

// Find existing CodeGraph comment
const existing = await GitHubPRService.findExistingComment(owner, repo, prNumber);
```

**Methods:**
- `isConfigured()` — Check if GITHUB_TOKEN is set
- `getPRDiff(owner, repo, prNumber)` — Fetch raw diff
- `parseDiff(diff)` — Extract file changes
- `formatImpactComment(changed, impacted, graphUrl)` — Format markdown
- `postPRComment(owner, repo, prNumber, markdown)` — Post comment
- `updatePRComment(owner, repo, commentId, markdown)` — Update comment
- `findExistingComment(owner, repo, prNumber)` — Find CodeGraph comment

### 2. ImpactAnalysisService (`server/src/services/ImpactAnalysisService.js`)

Analyzes code graph impact:

```js
import ImpactAnalysisService from '../../services/ImpactAnalysisService.js';

// Find all files affected by changed files (BFS traversal)
const { impactedFiles, depth } = await ImpactAnalysisService.findImpactedFiles(
  jobId,
  ['src/auth.js', 'src/config.js'],  // changed files
  3  // max depth to traverse
);

// Analyze change risk (safe vs risky)
const { safeFiles, riskyFiles } = await ImpactAnalysisService.analyzeChangeRisk(
  jobId,
  changedFiles
);

// Find circular dependencies for changed files
const cycles = await ImpactAnalysisService.findCircularDependencies(
  jobId,
  changedFiles
);
```

**Methods:**
- `findImpactedFiles(jobId, changedFiles, maxDepth)` — Find affected files
- `analyzeChangeRisk(jobId, changedFiles)` — Safe vs risky changes
- `findCircularDependencies(jobId, changedFiles)` — Circular deps

### 3. PR Comment Route (`server/src/api/webhooks/pr-comment.routes.js`)

Endpoints:

```
POST /api/webhooks/github/pr-comment
  Body: { jobId: string }
  Response: { success: true, commentUrl: string, changedFiles: number, impactedFiles: number }

GET /api/webhooks/github/pr-status/:prNumber
  Query: { owner: string, repo: string }
  Response: { hasComment: boolean, commentId?: number }
```

## Integration Points

### 1. Webhook Configuration

The GitHub webhook (Section 8.1) stores PR metadata in the job input:

```js
// server/src/api/webhooks/github.webhook.js

const prNumber = payload?.pull_request?.number;
const prTitle = payload?.pull_request?.title;

await enqueueAnalysisJob({
  jobId,
  input: {
    source: 'github',
    github: {
      owner,
      repo,
      branch,
      prNumber,      // ← NEW: for comment posting
      prTitle,       // ← NEW: for logging
    },
    repositoryId,
    userId,
  },
});
```

### 2. Job Completion Handler

After analysis completes, call the PR comment endpoint. This is typically done by:

**Option A: Webhook Callback (Recommended)**

Modify the SupervisorAgent to trigger a callback:

```js
// server/src/agents/core/SupervisorAgent.js

async runPipeline(jobId, input) {
  try {
    // ... run analysis pipeline ...
    
    // After completion, trigger PR comment posting
    if (input?.source === 'github' && input?.github?.prNumber) {
      await this._postPRComment(jobId, input.github);
    }
    
    return result;
  } catch (err) {
    // ...
  }
}

async _postPRComment(jobId, github) {
  try {
    const response = await fetch('http://localhost:5000/api/webhooks/github/pr-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    console.log('PR comment posted:', response.status);
  } catch (err) {
    console.error('Failed to post PR comment:', err);
    // Don't throw - analysis succeeded even if comment posting failed
  }
}
```

**Option B: External Trigger**

Call the endpoint externally after job completion:

```bash
curl -X POST http://localhost:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d '{"jobId":"abc123"}'
```

### 3. Database Interactions

The service queries:
- `analysis_jobs` — fetch job status and PR metadata
- `graph_nodes` — fetch graph structure for impact analysis
- `audit_logs` — record comment posting events

## Environment Configuration

### Required Variables

```bash
# server/.env

# GitHub API authentication
GITHUB_TOKEN=ghp_your_personal_access_token

# Optional: used in comment links
CLIENT_URL=http://localhost:5173
```

### Generating GITHUB_TOKEN

1. Visit https://github.com/settings/tokens
2. Click "Generate new token"
3. Select scopes:
   - `repo` — Full control of private repositories
   - `public_repo` — Access to public repositories (sufficient if repos are public)
4. Copy the token
5. Add to `.env`: `GITHUB_TOKEN=ghp_xxxx...`

⚠️ **Security:** Never commit `GITHUB_TOKEN` to git. Use environment variables or secrets management.

## PR Comment Format

The generated comment looks like:

```markdown
## 📊 CodeGraph Impact Analysis

**Generated:** 2026-03-30T12:34:56.789Z  
**Status:** ✅ Analysis Complete

### Changed Files (2)
- `src/auth.js`
- `src/config.js`

### Potentially Impacted Files (5)
- `src/api.js`
- `src/middleware.js`
- `src/controllers/user.js`
- `src/services/auth.service.js`
- `tests/auth.test.js`

---
🔗 [View Full Graph](http://localhost:5173/?jobId=abc123) | Powered by CodeGraph AI
```

### Comment Update Logic

- **First PR push:** Posts new comment
- **Subsequent pushes (synchronize):** Updates existing comment
- **Multiple PRs:** One comment per PR (finds and updates by content)

## Error Handling

### GitHub Token Missing

```
20x → POST /api/webhooks/github/pr-comment
Message: "GitHub token not configured, skipping comment"
Comment: Not posted
Status: No error, graceful degradation
```

### PR Diff Fetch Fails

```
200 → Response with error details
Comment: Not posted
Reason: Network issue, rate limit, PR deleted, etc.
```

### Graph Analysis Fails

```
200 → Response with error
Comment: Posted with note "Analysis incomplete"
Reason: Fallback comment posted with available data
```

## Testing

### Run Tests

```bash
cd server
npm install supertest  # if not installed
npm test -- test/pr-comment.test.js
```

### Example Test Cases

```js
// Valid PR with impact
POST /api/webhooks/github/pr-comment
Body: { jobId: 'job-123' }
Response: { success: true, commentUrl: '...', changedFiles: 2, impactedFiles: 5 }

// Missing GitHub token
DELETE process.env.GITHUB_TOKEN
Response: { message: 'GitHub token not configured' }

// Job not found
POST /api/webhooks/github/pr-comment
Body: { jobId: 'nonexistent' }
Response: { error: 'Job not found' }
```

## Performance Considerations

### Diff Parsing

- O(n) where n = diff size
- Typical PR diff: <100KB, parsing: <100ms
- Large PRs (1000+ files): may take 500ms+

### Graph Traversal (BFS)

- O(V + E) where V = files, E = dependencies
- Depth limit: 3 (prevents deep traversal)
- Typical codebase: <500ms

### GitHub API Calls

- 2 API calls per PR: getDiff + postComment
- Rate limit: 5,000 requests/hour (user auth)
- Cost: ~$0 (included in free tier)

### Optimization

If performance becomes an issue:

```js
// Cache diff for 5 minutes
const DIFF_CACHE_TTL = 5 * 60 * 1000;
const diffCache = new Map();

// Limit impact depth analysis
const MAX_DEPTH = 3;  // Already implemented

// Batch multiple PRs
const prQueue = [];
```

## Troubleshooting

### Comment Not Posted

**Check:**
1. `GITHUB_TOKEN` is set and valid
2. Token has `repo` scope
3. Repository is tracked in CodeGraph
4. PR number is correct in webhook payload
5. GitHub API is accessible

**Debug:**
```bash
# Check token validity
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user

# Check server logs
tail -f logs/server.log | grep "pr-comment"

# Manual trigger
curl -X POST http://localhost:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d '{"jobId":"abc123"}' -v
```

### Token Rate Limit

```
Error: API rate limit exceeded
Solution: Wait 1 hour or upgrade GitHub account
```

### Comment Formatting Issues

```
Problem: Markdown not rendering correctly
Solution: Check file paths don't contain backticks, ensure list format
```

## Future Enhancements

1. **Risk Assessment** — Flag high-risk changes (many dependents)
2. **Test Impact** — Show which tests might be affected
3. **Performance Impact** — Warn about performance-critical files
4. **Circular Dependencies** — Alert to circular deps in PR scope
5. **Suggestions** — Recommend files to add to PR scope
6. **Comment Reactions** — Add approve/request-changes reactions

## Related Documentation

- [Section 8.1 — Webhook Endpoint](./github-webhook-setup.md)
- [GitHub API Reference](https://docs.github.com/en/rest)
- [PR Webhook Events](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#pull_request)

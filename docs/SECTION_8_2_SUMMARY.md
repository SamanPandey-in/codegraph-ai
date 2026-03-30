# Section 8.2 — GitHub PR Impact Comments (Executive Summary)

## 🎯 What This Does

When a pull request is opened or updated, CodeGraph automatically analyzes the code graph and **posts a comment showing which files are impacted by the changes**.

The comment includes:
- ✅ List of changed files
- ✅ List of impacted files (files that depend on changed files)
- ✅ Direct link to the graph visualization
- 🔗 Clickable link to view full graph

## 🏗️ Architecture

```
PR opened/synchronized
    ↓
GitHub sends webhook (Section 8.1)
    ↓
Job created with PR metadata { owner, repo, prNumber }
    ↓
SupervisorAgent analyzes code (30-60 seconds)
    ↓
Analysis complete → Trigger PR comment posting
    ↓
1. Fetch PR diff from GitHub API
2. Parse changed files
3. Query graph: find files depending on changed files
4. Format markdown comment
5. Post/update comment on PR
```

## 📦 What Was Built

### Services

| Service | Purpose | Key Methods |
|---------|---------|------------|
| **GitHubPRService** | GitHub API interactions | `getPRDiff()`, `parseDiff()`, `postPRComment()`, `formatImpactComment()` |
| **ImpactAnalysisService** | Code graph analysis | `findImpactedFiles()`, `analyzeChangeRisk()`, `findCircularDependencies()` |

### Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/webhooks/github/pr-comment` | POST | Post analysis comment after job completes |
| `/api/webhooks/github/pr-status/:prNumber` | GET | Check if comment exists for PR |

### Tests

✅ 10+ test cases covering:
- Valid/invalid GitHub tokens
- Diff parsing with various formats
- Comment formatting and truncation
- Error handling and edge cases

## 🔧 Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install  # axios now included
```

### 2. Get GitHub Token
- Go to: https://github.com/settings/tokens/new
- Create token with `repo` scope
- Copy token

### 3. Configure
```bash
# server/.env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 🧬 Integration (Choose One)

### Option A: SupervisorAgent Callback
Add to `server/src/agents/core/SupervisorAgent.js`:
```js
async runPipeline(jobId, input) {
  const result = await this._executePipeline(jobId, input);
  if (input?.github?.prNumber) {
    await this._triggerPRCommentPosting(jobId); // ← Add this
  }
  return result;
}
```

### Option B: Queue Event Listener
Add to `server/src/queue/analysisQueue.js`:
```js
analysisWorker.on('completed', async (job) => {
  if (job.data?.input?.github?.prNumber) {
    await fetch('/api/webhooks/github/pr-comment', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.data.jobId }),
    });
  }
});
```

### Option C: External Trigger
Call after analysis:
```bash
curl -X POST http://localhost:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" -d '{"jobId":"..."}'
```

## 📊 Example Comment Output

**On GitHub PR:**
```
## 📊 CodeGraph Impact Analysis

Generated: 2026-03-30T12:34:56.789Z  
Status: ✅ Analysis Complete

### Changed Files (2)
- `src/auth.js`
- `src/config.js`

### Potentially Impacted Files (5)
- `src/api.js`
- `src/middleware.js`
- `src/controllers/user.js`
- `src/services/auth.service.js`
- `tests/auth.test.js`

🔗 View Full Graph | Powered by CodeGraph AI
```

## 📋 Files Created/Modified

**New:**
- `server/src/services/GitHubPRService.js` — GitHub API client
- `server/src/services/ImpactAnalysisService.js` — Graph analysis
- `server/src/api/webhooks/pr-comment.routes.js` — Express routes
- `server/test/pr-comment.test.js` — Test suite
- `docs/GITHUB_PR_COMMENTS.md` — Full documentation
- `docs/SECTION_8_2_INTEGRATION.md` — Integration guide

**Modified:**
- `server/app.js` — Added route registration
- `server/src/api/webhooks/github.webhook.js` — Added PR metadata
- `server/package.json` — Added axios dependency
- `server/.env.example` — Added GITHUB_TOKEN config

## ✨ Features

✅ **Diff Parsing** — Extract changed files from GitHub PR diff  
✅ **Graph Traversal** — BFS to find impacted files (configurable depth)  
✅ **Comment Updates** — Re-runs update existing comment (no duplicates)  
✅ **Error Handling** — Graceful fallback if GitHub API fails  
✅ **Rate Limit Safe** — Uses GitHub token auth (5,000 req/hour)  
✅ **Idempotent** — Safe to call multiple times  
✅ **Async** — Doesn't block analysis pipeline  

## 🧪 Testing

```bash
# Run tests
npm test -- test/pr-comment.test.js

# Manual test
curl -X POST http://localhost:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d '{"jobId":"your-job-id"}'
```

## 🚀 Production Checklist

- [ ] GitHub token configured and has `repo` scope
- [ ] Integration point chosen (A, B, or C above)
- [ ] Integration implemented in SupervisorAgent or queue
- [ ] Tested with real PR
- [ ] Monitored GitHub actions for rate limits
- [ ] Team reviewed comment format
- [ ] Deployment completed

## 📚 Documentation

- **Full API Reference:** [GITHUB_PR_COMMENTS.md](./GITHUB_PR_COMMENTS.md)
- **Integration Guide:** [SECTION_8_2_INTEGRATION.md](./SECTION_8_2_INTEGRATION.md)
- **Webhook Setup:** [GITHUB_WEBHOOK_SETUP.md](./GITHUB_WEBHOOK_SETUP.md)

## 🔗 Next Phase

After Section 8.2, implement:
- **Section 9:** Test Suite (70%+ coverage)
- **Section 10:** Production Hardening (Sentry, CI/CD)
- **Future:** Risk assessment, test impact, performance warnings

## 📞 Support

For issues:
1. Check logs: `tail -f logs/server.log | grep pr-comment`
2. Verify GitHub token: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user`
3. Test manually: use curl examples above
4. Review troubleshooting in [GITHUB_PR_COMMENTS.md](./GITHUB_PR_COMMENTS.md)

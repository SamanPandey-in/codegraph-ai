# Section 8.2 — Integration Checklist

## ✅ Completed

- [x] GitHub PR Service created (`server/src/services/GitHubPRService.js`)
- [x] Impact Analysis Service created (`server/src/services/ImpactAnalysisService.js`)
- [x] PR Comment route created (`server/src/api/webhooks/pr-comment.routes.js`)
- [x] Route registered in `app.js`
- [x] Webhook updated to store PR metadata
- [x] `GITHUB_TOKEN` added to `.env.example`
- [x] Comprehensive test suite created (`server/test/pr-comment.test.js`)
- [x] Complete documentation created (`docs/GITHUB_PR_COMMENTS.md`)
- [x] `axios` dependency added to `package.json`

## 📋 Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
# axios is now included
```

### 2. Configure GitHub Token

Get a GitHub personal access token:
- Visit: https://github.com/settings/tokens/new
- Name: "CodeGraph PR Integration"
- Scopes: Select ✓ `repo` (full control of private repositories)
- Generate and copy

Add to `.env`:
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Test Services Standalone

```bash
# Test diff parsing
node -e "
import GitHubPRService from './src/services/GitHubPRService.js';
const diff = \`diff --git a/src/app.js b/src/app.js\`;
console.log(GitHubPRService.parseDiff(diff));
"

# Test comment formatting
node -e "
import GitHubPRService from './src/services/GitHubPRService.js';
const comment = GitHubPRService.formatImpactComment(['src/auth.js'], ['src/api.js'], 'http://localhost:5173/?jobId=123');
console.log(comment);
"
```

### 4. Run Tests

```bash
npm test -- test/pr-comment.test.js
```

### 5. Trigger PR Comment Manually

```bash
# After an analysis job completes:
curl -X POST http://localhost:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d '{"jobId":"your-job-id-here"}'
```

## 🔌 Integration with Analysis Pipeline

The PR comment posting **must be triggered after analysis completes**. Choose one approach:

### Approach A: Supervisor Agent Callback (Recommended)

Modify `server/src/agents/core/SupervisorAgent.js`:

```js
async runPipeline(jobId, input) {
  try {
    // ... existing pipeline code ...
    const result = await this._executePipeline(jobId, input);
    
    // NEW: Post PR comment if GitHub PR
    if (input?.github?.prNumber) {
      await this._triggerPRCommentPosting(jobId);
    }
    
    return result;
  } catch (err) {
    // error handling
  }
}

async _triggerPRCommentPosting(jobId) {
  try {
    const url = `http://localhost:5000/api/webhooks/github/pr-comment`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    
    if (!response.ok) {
      console.error(`PR comment failed: ${response.status}`);
    } else {
      console.log('PR comment posted successfully');
    }
  } catch (err) {
    // Don't throw - analysis succeeded even if comment failed
    console.error('Failed to post PR comment:', err.message);
  }
}
```

### Approach B: Job Event Listener

Add a listener to the BullMQ queue:

```js
// server/src/queue/analysisQueue.js

analysisWorker.on('completed', async (job) => {
  if (job.data?.input?.github?.prNumber) {
    try {
      await fetch('http://localhost:5000/api/webhooks/github/pr-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.data.jobId }),
      });
    } catch (err) {
      console.error('Failed to post PR comment:', err);
    }
  }
});
```

### Approach C: External Trigger

Call after job completes from external service:

```bash
# External script/webhook handler
curl -X POST http://codegraph:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d "{\"jobId\":\"$JOB_ID\"}"
```

## 🗄️ Database Schema Requirements

The PR comment service queries these tables (must exist from Phase 2 migrations):

```sql
-- analysis_jobs table should have metadata field
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS metadata JSONB;

-- graph_nodes table needed for impact analysis
CREATE TABLE IF NOT EXISTS graph_nodes (
  id UUID PRIMARY KEY,
  jobId UUID REFERENCES analysis_jobs(id),
  relativePath TEXT,
  dependencies TEXT[],
  circularDeps JSONB,
  -- ... other columns ...
);

-- Optional: audit_logs for tracking PR comments
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES analysis_jobs(id),
  event_type TEXT,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

If tables don't exist, create migration: `server/src/infrastructure/migrations/004_pr_comments.sql`

## 🧪 End-to-End Test

1. **Set up tracking:**
   ```bash
   export GITHUB_TOKEN="ghp_..."
   export CLIENT_URL="http://localhost:5173"
   npm start
   ```

2. **Create test PR:**
   ```bash
   git checkout -b test/pr-integration
   echo "// test" > test.js
   git add . && git commit -m "test"
   git push origin test/pr-integration
   ```
   Open PR on GitHub

3. **Check webhook triggered:**
   ```
   Server logs should show:
   [webhook:info] Processing PR opened
   [webhook:info] Analysis job queued successfully
   ```

4. **Wait for analysis to complete** (~30-60 seconds)

5. **Check for comment:**
   - Go to PR on GitHub
   - Should see "CodeGraph Impact Analysis" comment
   - Shows changed files and impacted files

6. **Verify comment updates on new push:**
   ```bash
   echo "// update" >> test.js
   git add . && git commit -m "update"
   git push origin test/pr-integration
   ```
   Comment should update (not duplicate)

## 🐛 Troubleshooting

### Comment Not Posted

**Check Server Logs:**
```bash
tail -f logs/server.log | grep "pr-comment"
```

**Verify Token:**
```bash
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

**Manual Trigger:**
```bash
curl -X POST http://localhost:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d '{"jobId":"abc123"}' -v
```

### Token Rate Limited

```
Error: API rate limit exceeded (60 per hour)
Solution: GitHub personal token has 5,000 req/hour
         Wait or upgrade to GitHub App auth (10,000 req/hour)
```

### Job Not Found

```
404 Error
Check: jobId is correct UUID
      Job exists in database: SELECT * FROM analysis_jobs WHERE id = 'xxx';
```

## 📚 Files Modified/Created

```
server/
├── src/
│   ├── services/
│   │   ├── GitHubPRService.js              ← NEW
│   │   └── ImpactAnalysisService.js        ← NEW
│   ├── api/webhooks/
│   │   ├── github.webhook.js               (updated: added PR metadata)
│   │   └── pr-comment.routes.js            ← NEW
│   └── infrastructure/
│       └── connections.js                   (no changes)
├── app.js                                   (updated: added route)
├── package.json                             (updated: added axios)
└── test/
    └── pr-comment.test.js                  ← NEW

server/.env.example                          (updated: added GITHUB_TOKEN)

docs/
├── GITHUB_WEBHOOK_SETUP.md                 (existing: Section 8.1)
└── GITHUB_PR_COMMENTS.md                   ← NEW: Section 8.2
```

## 🚀 Next Steps

1. **Choose integration approach** (A, B, or C above)
2. **Implement in SupervisorAgent or queue handler**
3. **Test end-to-end with real PR**
4. **Monitor logs and GitHub comments**
5. **Collect feedback from team**
6. **Iterate on comment format/content**

## 📖 Related Docs

- [Section 8.1 — Webhook Setup](./GITHUB_WEBHOOK_SETUP.md)
- [Section 8.2 — PR Comments](./GITHUB_PR_COMMENTS.md)
- [Phase 3 Guide](./Phase3/PHASE3_GUIDE.md)

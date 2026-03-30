# Section 8 Complete — GitHub PR Integration Flow

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                           │
│  Developer commits to PR branch and opens/updates pull request      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    GitHub sends webhook event
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │   Section 8.1 — Webhook Endpoint      │
         │  /api/webhooks/github (POST)          │
         │                                       │
         │  • Verify signature (timing-safe)    │
         │  • Parse pull_request event          │
         │  • Filter: opened|synchronize        │
         │  • Extract: owner, repo, prNumber    │
         │  • Create analysis_jobs row          │
         │  • Store PR metadata in job input    │
         └────────────┬────────────────────────┘
                      │
              Enqueue analysis job
              (BullMQ + Redis)
                      │
                      ▼
         ┌───────────────────────────────────────┐
         │      SupervisorAgent Pipeline         │
         │                                       │
         │  1. ScannerAgent (find files)        │
         │  2. ParserAgent (parse code)         │
         │  3. EnrichmentAgent (add context)    │
         │  4. GraphBuilderAgent (build graph)  │
         │  5. PersistenceAgent (save results)  │
         │                                       │
         │       ⏱️  30-60 seconds              │
         └────────────┬────────────────────────┘
                      │
              Analysis complete
                      │
                      ▼
        ┌────────────────────────────────────────┐
        │  Section 8.2 — PR Comment Posting      │
        │ /api/webhooks/github/pr-comment (POST) │
        │                                        │
        │ 1. Fetch PR diff from GitHub API      │
        │ 2. Parse changed files from diff      │
        │ 3. Query code graph from DB:          │
        │    - Find graph_nodes for changed    │
        │    - BFS traverse: dependencies      │
        │    - Collect impacted files          │
        │ 4. Format markdown comment           │
        │ 5. Check for existing comment        │
        │ 6. Post (new) or update (existing)   │
        │ 7. Log event to audit trail          │
        └────────────┬─────────────────────────┘
                     │
              POST to GitHub API
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │          GitHub Pull Request           │
        │                                        │
        │  Developer sees comment showing:       │
        │  • Which files changed                │
        │  • Which files are impacted           │
        │  • Link to graph visualization        │
        │                                        │
        │  On next push (synchronize):          │
        │  • Comment automatically updates      │
        │  • No duplicate comments              │
        └────────────────────────────────────────┘
```

## Component Interactions

```
                    ┌─────────────────────────────┐
                    │   GitHub Webhook Router     │
                    │ (github.webhook.js)         │
                    └────────────┬────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
    ┌─────────────────────────┐    ┌──────────────────────────┐
    │ Webhook Event Handler   │    │ PR Comment Handler       │
    │                         │    │                          │
    │ • Verify signature      │    │ /api/webhooks/github/    │
    │ • Parse payload         │    │  pr-comment              │
    │ • Store PR metadata     │    │                          │
    │ • Enqueue job          │    │ • Validate jobId         │
    │                        │    │ • Query database         │
    └────────────┬───────────┘    └────────┬─────────────────┘
                 │                         │
                 │ { jobId, prNumber }    │
                 │                        │
    ┌────────────▼─────────────┐   ┌──────▼──────────────────┐
    │  BullMQ Queue            │   │  GitHubPRService        │
    │  (analysisQueue)         │   │  (GitHubPRService.js)   │
    │                          │   │                         │
    │  • Worker processes job  │   │ • getPRDiff()           │
    │  • Calls SupervisorAgent │   │ • parseDiff()           │
    │  • Emits 'completed'     │   │ • formatImpactComment() │
    │                          │   │ • postPRComment()       │
    └────────┬─────────────────┘   │ • updatePRComment()     │
             │                     │ • findExistingComment() │
             │ on completed        │ • isConfigured()        │
             │                     └──────┬──────────────────┘
             └────────┬────────────────────┘
                      │
            ┌─────────▼──────────────────┐
            │ ImpactAnalysisService      │
            │ (ImpactAnalysisService.js) │
            │                            │
            │ • findImpactedFiles()      │
            │   - Query graph_nodes      │
            │   - BFS on dependencies    │
            │   - Configurable depth     │
            │                            │
            │ • analyzeChangeRisk()      │
            │   - Identify risky changes │
            │                            │
            │ • findCircularDeps()       │
            │   - Detect cycles          │
            └────────┬────────────────────┘
                     │
            ┌────────▼──────────────────┐
            │   PostgreSQL Database      │
            │                            │
            │ Tables queried:            │
            │ • analysis_jobs            │
            │ • repositories             │
            │ • graph_nodes              │
            │ • audit_logs               │
            │                            │
            │ (from Phase 2 migrations)  │
            └────────────────────────────┘
```

## Data Flow: PR Comment Generation

```
Input: jobId
  │
  ├─ Query: analysis_jobs WHERE id = jobId
  │  └─ Get: github_owner, github_repo, prNumber, branch
  │
  ├─ Call: GitHubPRService.getPRDiff(owner, repo, prNumber)
  │  └─ GitHub API: GET /repos/{owner}/{repo}/pulls/{prNumber}
  │     └─ Returns: raw diff (multiline string)
  │
  ├─ Call: GitHubPRService.parseDiff(diff)
  │  └─ Returns: [{file, status}, ...] (changed files)
  │
  ├─ Call: ImpactAnalysisService.findImpactedFiles(jobId, changedFiles)
  │  │
  │  ├─ Query: graph_nodes WHERE jobId = jobId
  │  │  └─ Build adjacency map: file → [dependents]
  │  │
  │  └─ BFS traversal (max depth 3)
  │     └─ Returns: Set of impacted files
  │
  ├─ Call: GitHubPRService.formatImpactComment(changed, impacted, graphUrl)
  │  └─ Returns: markdown formatted comment
  │
  ├─ Call: GitHubPRService.findExistingComment(owner, repo, prNumber)
  │  └─ GitHub API: GET /repos/{owner}/{repo}/issues/{prNumber}/comments
  │     └─ Returns: existing comment ID or null
  │
  ├─ If existing:
  │  │ Call: GitHubPRService.updatePRComment(owner, repo, commentId, markdown)
  │  │ └─ GitHub API: PATCH /repos/{owner}/{repo}/issues/comments/{commentId}
  │  │
  │  └─ Returns: {id, url}
  │
  ├─ Else:
  │  │ Call: GitHubPRService.postPRComment(owner, repo, prNumber, markdown)
  │  │ └─ GitHub API: POST /repos/{owner}/{repo}/issues/{prNumber}/comments
  │  │
  │  └─ Returns: {id, url}
  │
  └─ Output: {success, commentUrl, changedFilesCount, impactedFilesCount}
```

## Integration Point: Triggering PR Comment

The PR comment must be triggered **after analysis completes**. Three options:

```
OPTION A: Supervisor Agent
─────────────────────────
Running in: SupervisorAgent.runPipeline()

// After all agents complete
if (input?.github?.prNumber) {
  await fetch('/api/webhooks/github/pr-comment', {
    method: 'POST',
    body: JSON.stringify({ jobId })
  });
}

Result: Comment posted 30-60s after PR opened


OPTION B: Queue Event Listener  
──────────────────────────────
Running in: analysisQueue.js

analysisWorker.on('completed', async (job) => {
  if (job.data?.input?.github?.prNumber) {
    await fetch('/api/webhooks/github/pr-comment', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.data.jobId })
    });
  }
});

Result: Triggered when BullMQ job completes


OPTION C: External Service
──────────────────────────
Running in: External webhook/CLI

curl -X POST http://codegraph:5000/api/webhooks/github/pr-comment \
  -H "Content-Type: application/json" \
  -d '{"jobId":"..."}' 

Result: On-demand comment posting from outside
```

## Error Handling Strategy

```
Error Scenario                          → Response           → Behavior
─────────────────────────────────────────────────────────────────────────
GitHub token missing                    → 200 OK             → Skip (log warning)
Token rate limited (GitHub API)         → 200 OK + error     → Skip gracefully
Job not found in database               → 404                → Return error
PR not found in GitHub                  → 200 OK + error     → Skip gracefully
Diff parsing fails                      → 200 OK + error     → Post generic comment
Graph analysis fails                    → 200 OK             → Post with "pending data"
Comment post fails                      → 200 OK + error     → Retry not auto

All errors:
  • Logged to console and audit_logs table
  • Don't block analysis pipeline
  • Return informative response to caller
```

## Performance Profile

```
Operation                   Typical Time    Max Time    Bottleneck
─────────────────────────────────────────────────────────────────
1. Fetch PR diff            100-300ms       2s         Network (GitHub API)
2. Parse diff               10-50ms         500ms      Large PRs (1000+ files)
3. Query graph_nodes        50-200ms        2s         Database query
4. BFS traversal (depth 3)  100-500ms       3s         Large dependency graph
5. Format markdown          10-30ms         100ms      File list size
6. Find existing comment    200-500ms       2s         Network (GitHub API)
7. Post/update comment      200-500ms       2s         Network (GitHub API)

Total E2E:                  ~1-3 seconds    ~12s       Network I/O

Optimizations (future):
  • Cache PR diff for 5 minutes
  • Limit graph traversal depth to 2
  • Batch multiple PR comments
  • Use GitHub GraphQL API (fewer requests)
```

## Configuration Summary

```
Environment Variables:
  GITHUB_TOKEN              Required for posting comments
  CLIENT_URL                Used in comment link (default: http://localhost:5173)
  DATABASE_URL              Database connection (existing)
  REDIS_URL                 Redis connection (existing)

Database Tables (must exist):
  analysis_jobs             └─ jobId, status, repository_id, metadata
  repositories              └─ github_owner, github_repo
  graph_nodes               └─ jobId, relativePath, dependencies
  audit_logs                └─ job_id, event_type (optional)

GitHub Token Scopes:
  repo                      ✓ Full control of private repos (recommended)
  public_repo               ✓ Access to public repos only (alternative)

GitHub API Rate Limit:
  With token auth:          5,000 requests/hour
  Cost per PR:              2 API calls (getDiff + postComment)
  Safety margin:            >2,000 PRs/hour capacity
```

## Success Criteria

✅ PR comment posts within 2 minutes of PR open  
✅ Comment updates on PR synchronize (no duplicates)  
✅ Changed files list is accurate  
✅ Impacted files reflect actual dependencies  
✅ Comment link to graph works  
✅ No errors in server logs  
✅ GitHub token never exposed in logs  
✅ Works with public and private repos  
✅ Handles large diffs (1000+ files)  
✅ Graceful fallback if GitHub API fails  

## Files at a Glance

```
server/
├── src/
│   ├── api/webhooks/
│   │   ├── github.webhook.js                  (8.1: webhook receiver)
│   │   └── pr-comment.routes.js               (8.2: comment posting)
│   ├── services/
│   │   ├── GitHubPRService.js                 (8.2: GitHub API)
│   │   └── ImpactAnalysisService.js           (8.2: graph analysis)
│   └── agents/core/
│       └── SupervisorAgent.js                 (modify: add callback)
├── app.js                                     (register routes)
├── package.json                               (add: axios)
└── test/
    └── pr-comment.test.js                     (8.2: tests)

docs/
├── GITHUB_WEBHOOK_SETUP.md                    (8.1: full setup guide)
├── GITHUB_PR_COMMENTS.md                      (8.2: API reference)
├── SECTION_8_2_INTEGRATION.md                 (8.2: integration steps)
└── SECTION_8_2_SUMMARY.md                     (8.2: executive summary)
```

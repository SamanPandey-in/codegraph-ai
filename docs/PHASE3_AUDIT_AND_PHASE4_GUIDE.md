# CodeGraph AI — Phase 3 Audit & Fixes + Phase 4 Guide

---

## Part 1: Phase 3 Audit — Shortcomings & How to Fix Them

### Overview

Phase 3 is structurally well-built: multi-language parsing works, streaming explanations work, the share token system works, function-node expansion is wired in GraphView, starred repos and query history are implemented. However there are **8 bugs** — some critical, some silent — that will cause runtime failures. Each one is documented below with the exact fix.

---

### Bug 1 — PR Comment Route References Non-Existent DB Columns (CRITICAL)

**File:** `server/src/api/webhooks/pr-comment.routes.js`

The route queries `aj.metadata ->> 'prNumber'` and inserts into `audit_logs`, but neither the `metadata` column on `analysis_jobs` nor the `audit_logs` table exist in your schema. The `001_initial.sql` defines only `agent_audit_log`. This route will throw a PostgreSQL error on every invocation.

**Fix — Step 1:** Create a new migration:

**File:** `server/src/infrastructure/migrations/004_analysis_jobs_metadata.sql`

```sql
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  message     TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_job ON audit_logs(job_id);
```

**Fix — Step 2:** Store prNumber/prTitle in the job's metadata when the webhook enqueues:

**File:** `server/src/api/webhooks/github.webhook.js` — in the `INSERT INTO analysis_jobs` block, change:

```js
// Before:
const jobResult = await pgPool.query(
  `INSERT INTO analysis_jobs (repository_id, user_id, branch, status)
   VALUES ($1, $2, $3, 'queued') RETURNING id`,
  [repositoryId, userId, branch],
);

// After:
const jobResult = await pgPool.query(
  `INSERT INTO analysis_jobs (repository_id, user_id, branch, status, metadata)
   VALUES ($1, $2, $3, 'queued', $4) RETURNING id`,
  [repositoryId, userId, branch, JSON.stringify({ prNumber, prTitle })],
);
```

Add to the `package.json` migrate script to include the new migration:

```json
"migrate": "psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f ./src/infrastructure/migrations/001_initial.sql -f ./src/infrastructure/migrations/002_function_nodes.sql -f ./src/infrastructure/migrations/003_share_tokens.sql -f ./src/infrastructure/migrations/004_analysis_jobs_metadata.sql || true"
```

---

### Bug 2 — SupervisorAgent Never Triggers PR Comment (CRITICAL — The Missing Webhook Link)

**File:** `server/src/agents/core/SupervisorAgent.js`

This is the **most important wiring gap** in Phase 3. The GitHub webhook correctly receives the PR event and enqueues an analysis job. The SupervisorAgent pipeline runs and completes. But after completion, nothing calls the `POST /api/webhooks/github/pr-comment` endpoint. The PR comment is never posted.

**Where it goes:** Inside `SupervisorAgent.runPipeline()`, after the pipeline reaches `'completed'` status — specifically after `_updateJobStatus(jobId, 'completed', ...)` is called and the pipeline data object is fully populated.

**Fix:** Add a post-completion hook to `runPipeline()`:

**File:** `server/src/agents/core/SupervisorAgent.js`

At the top of the file, add the import:

```js
import GitHubPRService from '../../services/GitHubPRService.js';
import ImpactAnalysisService from '../../services/ImpactAnalysisService.js';
```

At the end of `runPipeline()`, after the `_updateJobStatus(jobId, 'completed', ...)` call and before the cleanup:

```js
// ── Post-completion: trigger PR comment if this was a GitHub PR job ──────────
await this._tryPostPRComment(jobId, input);

// ── Cleanup temp files ───────────────────────────────────────────────────────
await this.agents.ingestion.cleanup(pipelineData.tempRoot);
```

Add the new method to the class:

```js
async _tryPostPRComment(jobId, input) {
  try {
    const prNumber = input?.github?.prNumber;
    const owner = input?.github?.owner;
    const repo = input?.github?.repo;

    if (!prNumber || !owner || !repo) return;
    if (!GitHubPRService.isConfigured()) {
      console.log('[SupervisorAgent] GitHub token not configured, skipping PR comment.');
      return;
    }

    // Get changed files from the PR diff
    let diff;
    try {
      diff = await GitHubPRService.getPRDiff(owner, repo, parseInt(prNumber, 10));
    } catch (err) {
      console.warn('[SupervisorAgent] Could not fetch PR diff:', err.message);
      return;
    }

    const changedFiles = GitHubPRService.parseDiff(diff).map((f) => f.file);
    if (changedFiles.length === 0) return;

    const { impactedFiles } = await ImpactAnalysisService.findImpactedFiles(jobId, changedFiles, 3);
    const graphUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/graph?jobId=${jobId}`;
    const comment = GitHubPRService.formatImpactComment(
      changedFiles,
      Array.from(impactedFiles).sort(),
      graphUrl,
    );

    const existing = await GitHubPRService.findExistingComment(owner, repo, parseInt(prNumber, 10));
    if (existing) {
      await GitHubPRService.updatePRComment(owner, repo, existing.id, comment);
    } else {
      await GitHubPRService.postPRComment(owner, repo, parseInt(prNumber, 10), comment);
    }

    console.log(`[SupervisorAgent] PR comment posted to ${owner}/${repo}#${prNumber}`);
  } catch (err) {
    // PR comment failure must never abort the main pipeline.
    console.error('[SupervisorAgent] Failed to post PR comment:', err.message);
  }
}
```

---

### Bug 3 — ImpactAnalysisService Uses Wrong Column Names (CRITICAL)

**File:** `server/src/services/ImpactAnalysisService.js`

The service queries `relativePath`, `dependencies`, `jobId`, and `cirularDeps` — but the actual `graph_nodes` table columns are `file_path`, `job_id` (snake_case), and the `deps` array comes from `graph_edges`, not a column on `graph_nodes`. The entire service will return empty results silently.

**Fix:** Replace `ImpactAnalysisService.js` with this corrected version:

```js
import { pgPool } from '../infrastructure/connections.js';

class ImpactAnalysisService {
  async findImpactedFiles(jobId, changedFiles, maxDepth = 3) {
    if (!jobId || changedFiles.length === 0) {
      return { impactedFiles: new Set(), depth: 0 };
    }

    try {
      // Build reverse adjacency: target_path → [source files that import it]
      const edgeResult = await pgPool.query(
        `SELECT source_path, target_path FROM graph_edges WHERE job_id = $1`,
        [jobId],
      );

      const reverseMap = new Map();
      for (const row of edgeResult.rows) {
        if (!reverseMap.has(row.target_path)) reverseMap.set(row.target_path, []);
        reverseMap.get(row.target_path).push(row.source_path);
      }

      const impactedFiles = new Set();
      const visited = new Set(changedFiles);
      let currentLevel = changedFiles;
      let depth = 0;

      while (currentLevel.length > 0 && depth < maxDepth) {
        const nextLevel = [];
        for (const file of currentLevel) {
          for (const dependent of (reverseMap.get(file) || [])) {
            if (!visited.has(dependent)) {
              visited.add(dependent);
              impactedFiles.add(dependent);
              nextLevel.push(dependent);
            }
          }
        }
        currentLevel = nextLevel;
        depth++;
      }

      return { impactedFiles, depth };
    } catch (err) {
      console.error('[ImpactAnalysisService] findImpactedFiles failed:', err.message);
      return { impactedFiles: new Set(), depth: 0 };
    }
  }

  async analyzeChangeRisk(jobId, changedFiles) {
    if (!jobId || changedFiles.length === 0) {
      return { safeFiles: [], riskyFiles: [] };
    }

    try {
      // Count how many files import each changed file via graph_edges
      const result = await pgPool.query(
        `SELECT gn.file_path,
                COUNT(ge.source_path) AS dependent_count
         FROM graph_nodes gn
         LEFT JOIN graph_edges ge ON ge.target_path = gn.file_path AND ge.job_id = gn.job_id
         WHERE gn.job_id = $1 AND gn.file_path = ANY($2::text[])
         GROUP BY gn.file_path`,
        [jobId, changedFiles],
      );

      const safeFiles = [];
      const riskyFiles = [];
      for (const row of result.rows) {
        if (parseInt(row.dependent_count, 10) === 0) {
          safeFiles.push(row.file_path);
        } else {
          riskyFiles.push(row.file_path);
        }
      }
      return { safeFiles, riskyFiles };
    } catch (err) {
      console.error('[ImpactAnalysisService] analyzeChangeRisk failed:', err.message);
      return { safeFiles: [], riskyFiles: [] };
    }
  }
}

export default new ImpactAnalysisService();
```

---

### Bug 4 — `/api/ai/query` Blocks Free Users Entirely (UX Break)

**File:** `server/src/api/ai/routes/ai.routes.js`

```js
router.post('/query', requirePlan('pro', 'team'), ...)
```

Every free-plan user gets a 403. The intent of the plan system was usage limits, not complete denial. A free user who just analyzed a repo cannot ask a single question.

**Fix:** Replace plan gating on query with a daily usage counter:

```js
// Remove requirePlan from the /query route
router.post('/query', async (req, res, next) => {
  // ... existing auth check ...

  // Check daily quota from Redis instead
  const plan = req.userPlan || 'free';
  const limits = { free: 10, pro: 200, team: 1000 };
  const dailyLimit = limits[plan] || 10;
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const quotaKey = `quota:ai_query:${userId}:${today}`;

  const currentCount = parseInt(await redisClient.get(quotaKey) || '0', 10);
  if (currentCount >= dailyLimit) {
    return res.status(429).json({
      error: `Daily AI query limit reached (${dailyLimit} queries/day on your plan).`,
      currentPlan: plan,
      upgradeUrl: '/settings/billing',
    });
  }

  await redisClient.multi()
    .incr(quotaKey)
    .expire(quotaKey, 86400) // expire at end of day + buffer
    .exec();

  // ... rest of route ...
});
```

Also update `requirePlan` imports in the route file accordingly — remove the import if unused elsewhere in that file.

---

### Bug 5 — `VITE_SHARE_BASE_URL` Is a Client-Only Env Var Used on the Server

**File:** `server/src/api/share/routes/share.routes.js`

```js
// Wrong — VITE_ prefix is stripped by Vite; Node.js never sees this variable
const baseUrl = String(process.env.VITE_SHARE_BASE_URL || process.env.CLIENT_URL || '').trim()
```

`VITE_` prefixed variables are injected into the client bundle by Vite at build time. They are never present in `process.env` on the Node.js server. This means `VITE_SHARE_BASE_URL` is always undefined on the server, so the share URL silently falls back to `CLIENT_URL`.

**Fix:** Remove `VITE_SHARE_BASE_URL` from the server route and use `CLIENT_URL` directly:

```js
function buildShareUrl(token) {
  const baseUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').trim();

  try {
    const url = new URL('/graph', baseUrl);
    url.searchParams.set('share', token);
    return url.toString();
  } catch {
    return `/graph?share=${encodeURIComponent(token)}`;
  }
}
```

Also clean up `server/.env.example` — remove `VITE_SHARE_BASE_URL` and replace with:

```bash
# The public URL of the client app (used for share links, PR comments, etc.)
CLIENT_URL=http://localhost:5173
```

---

### Bug 6 — `main.jsx` Is Missing the Sentry ErrorBoundary Wrapper

**File:** `client/src/main.jsx`

Sentry is initialised correctly, but the render call has an empty line where the `Sentry.ErrorBoundary` should be. Without it, React errors are reported to Sentry but the user sees a blank white page with no feedback.

**Fix:**

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error }) => (
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#dc2626' }}>
          <h2>Something went wrong</h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{error?.message || 'Unknown error'}</p>
        </div>
      )}
    >
      <Provider store={store}>
        <App />
      </Provider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
```

---

### Bug 7 — GraphView Function Node Expansion Has No Empty-State Handling

**File:** `client/src/features/graph/components/GraphView.jsx`

When `getFunctionNodes` returns an empty array (file has no extractable function declarations, or `function_nodes` table is empty for that file because `PersistenceAgent` only writes function nodes if the parser returned them), the double-click silently does nothing. Users double-click repeatedly thinking the feature is broken.

**Fix:** Add feedback for the empty case:

```jsx
const onNodeDoubleClick = useCallback(
  async (_event, node) => {
    if (!jobId || !graph[node.id]) return;
    if (expandedNodesRef.current.has(node.id)) return;

    try {
      const functionDeclarations = await graphService.getFunctionNodes(jobId, node.id);

      if (functionDeclarations.length === 0) {
        // Visual feedback: briefly pulse the node border
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id
              ? { ...n, style: { ...n.style, boxShadow: '0 0 0 2px #888, 0 0 8px #88888844' } }
              : n,
          ),
        );
        setTimeout(() => {
          setNodes((prev) =>
            prev.map((n) => (n.id === node.id ? { ...n, style: { ...n.style, boxShadow: undefined } } : n)),
          );
        }, 800);
        return;
      }

      // ... rest of expansion logic unchanged ...
      expandedNodesRef.current.add(node.id);
    } catch (err) {
      console.warn('[GraphView] Failed to load function nodes:', err.message);
    }
  },
  [dispatch, graph, jobId, setNodes, themeMode],
);
```

---

### Bug 8 — CI Workflow Uses Semicolons Instead of `&&` (Shell Syntax)

**File:** `.github/workflows/ci.yml`

```yaml
# Wrong — semicolon means "run second command regardless of first command's exit code"
- run: cd server; npm ci
- run: cd server; npm run test:coverage

# Correct — use && so failures propagate
- run: cd server && npm ci
- run: cd server && npm run test:coverage env: ...
```

On GitHub Actions, each `run:` step uses a fresh shell, so `cd server` followed by `npm ci` in separate steps won't work. The correct pattern is either `working-directory` or `&&`:

```yaml
- name: Install server dependencies
  run: npm ci
  working-directory: server

- name: Run migrations
  run: npm run migrate
  working-directory: server
  env:
    DATABASE_URL: postgres://postgres:postgres@localhost:5432/codegraph_test

- name: Run tests
  run: npm run test:coverage
  working-directory: server
  env:
    DATABASE_URL: postgres://postgres:postgres@localhost:5432/codegraph_test
    REDIS_URL: redis://localhost:6379
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    JWT_SECRET: test_secret

- name: Install client dependencies
  run: npm ci
  working-directory: client

- name: Build client
  run: npm run build
  working-directory: client
```

---

### Where the GitHub PR Webhook Integration Lives (Answered)

The PR integration is split across four files that form a complete chain:

```
GitHub sends webhook
        │
        ▼
POST /api/webhooks/github       ← github.webhook.js
  Verifies signature, parses PR event,
  looks up repository in DB,
  creates analysis_jobs row (with metadata: { prNumber, prTitle }),
  enqueues job via BullMQ
        │
        ▼
BullMQ worker picks up job
        │
        ▼
SupervisorAgent.runPipeline()   ← SupervisorAgent.js
  Runs full 7-agent pipeline
  On completion → calls _tryPostPRComment()   ← ADD THIS (Bug 2 fix)
        │
        ▼
_tryPostPRComment()
  Calls GitHubPRService.getPRDiff()          ← GitHubPRService.js
  Calls ImpactAnalysisService.findImpacted() ← ImpactAnalysisService.js (Bug 3 fix)
  Formats and posts comment via GitHub API
        │
        ▼
GitHub PR gets comment with impact report
```

The `pr-comment.routes.js` is a **manual HTTP trigger** for re-posting or updating a PR comment after the fact (e.g. from an admin dashboard). It is not the primary trigger. The primary trigger is inside `SupervisorAgent._tryPostPRComment()` which you need to add per Bug 2 above.

---

### Frontend Configuration Gaps

These are all the places where the frontend is not configured or is missing wiring:

**1. `client/.env` / `client/.env.example`**

The `.env.example` has `VITE_APP_NAME=StarterApp` — rename this to `CodeGraph AI`. More importantly the following vars need to be set in a real `.env`:

```bash
VITE_API_BASE_URL=http://localhost:5000   # already set, but confirm port matches server
VITE_APP_NAME=CodeGraph AI
VITE_APP_ENV=development
VITE_SENTRY_DSN=                          # fill in from Sentry dashboard
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
```

**2. Sentry ErrorBoundary missing in `main.jsx`** — covered in Bug 6 above.

**3. `GraphPage.jsx` — share URL loads via `?share=TOKEN` but the `loadSharedGraph` thunk is not guarded**

If a user opens a shared link while already having a graph loaded in Redux, `loadSharedGraph` will overwrite it without warning. Add a confirmation guard:

```jsx
// In GraphPage.jsx, update the shareToken useEffect:
useEffect(() => {
  if (!shareToken) return;
  if (data?.jobId && !data?.jobId?.startsWith('shared:')) {
    // Don't overwrite an existing private graph silently
    if (!window.confirm('Load shared graph? This will replace your current view.')) return;
  }
  dispatch(loadSharedGraph({ token: shareToken }));
}, [dispatch, shareToken]);
```

**4. `QueryBar` has no upgrade prompt for free users**

When the server returns 403 from `/api/ai/query` (plan gate), the `aiSlice` puts the error in `state.ai.query.error`. The `QueryBar` shows a generic "Failed to query repository" message. Add a plan-aware error handler:

```jsx
// In QueryBar.jsx, replace the generic error display:
{hasError && (
  <div className="flex items-start gap-2">
    <AlertCircle className="size-4 text-destructive/70 shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <p className="text-sm text-destructive/80">
        {error?.code === 'HTTP_403'
          ? 'AI queries require a Pro plan.'
          : error.message || 'Failed to query repository'}
      </p>
      {error?.code === 'HTTP_403' && (
        <a href="/settings/billing" className="text-xs text-primary underline mt-1 inline-block">
          Upgrade plan
        </a>
      )}
    </div>
  </div>
)}
```

**5. No route for `/settings/billing` exists**

The `requirePlan` middleware returns `upgradeUrl: '/settings/billing'` and the QueryBar error above links to it, but no such page exists. Either create a basic settings page or change the URL to a Stripe payment link (Phase 4 item).

---

## Part 2: Phase 4 — Complete Implementation Guide

Phase 4 is the monetisation, collaboration, and intelligence layer. It transforms CodeGraph AI from a developer tool into a SaaS product.

---

### Phase 4 Pillars

1. **Billing & Monetisation** — Stripe integration, plan enforcement, usage metering
2. **Team Workspaces** — Multiple users per org, shared repos, role-based access
3. **Refactor Intelligence** — AI-powered refactor suggestions, complexity heatmaps
4. **PR Status Checks** — GitHub Checks API (green/red status alongside CI)
5. **VS Code Extension** — Bring the graph into the editor

---

### Section P4-1: Stripe Billing

#### P4-1.1 Schema additions

**File:** `server/src/infrastructure/migrations/005_billing.sql`

```sql
CREATE TABLE subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_sub_id      TEXT UNIQUE,
  plan               TEXT NOT NULL DEFAULT 'free',
  status             TEXT NOT NULL DEFAULT 'active',  -- active | past_due | cancelled
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,    -- 'ai_query' | 'analysis_run' | 'embedding'
  quantity   INTEGER NOT NULL DEFAULT 1,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user_date ON usage_events(user_id, created_at);
```

#### P4-1.2 Install Stripe

```bash
cd server && npm install stripe
```

```bash
# Add to server/.env:
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
```

#### P4-1.3 Billing routes

**New file:** `server/src/api/billing/billing.routes.js`

```js
import { Router } from 'express';
import Stripe from 'stripe';
import { pgPool } from '../../../infrastructure/connections.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = Router();

// POST /api/billing/checkout  — create Stripe checkout session
router.post('/checkout', async (req, res, next) => {
  try {
    const { priceId, plan } = req.body;
    const userId = req.userId; // set by auth middleware

    const userResult = await pgPool.query(
      `SELECT email, username FROM users WHERE id = $1`,
      [userId],
    );
    const user = userResult.rows[0];

    // Get or create Stripe customer
    let customerId;
    const subResult = await pgPool.query(
      `SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1`,
      [userId],
    );
    if (subResult.rows[0]?.stripe_customer_id) {
      customerId = subResult.rows[0].stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL}/settings/billing?success=1`,
      cancel_url: `${process.env.CLIENT_URL}/settings/billing?cancelled=1`,
      metadata: { userId, plan },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (err) {
    return next(err);
  }
});

// POST /api/billing/portal  — Stripe billing portal for cancellation/upgrade
router.post('/portal', async (req, res, next) => {
  try {
    const userId = req.userId;
    const subResult = await pgPool.query(
      `SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1`,
      [userId],
    );
    const customerId = subResult.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(404).json({ error: 'No active subscription found.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.CLIENT_URL}/settings/billing`,
    });

    return res.json({ portalUrl: session.url });
  } catch (err) {
    return next(err);
  }
});

export default router;
```

#### P4-1.4 Stripe webhook handler

**New file:** `server/src/api/billing/stripe.webhook.js`

```js
import { Router } from 'express';
import Stripe from 'stripe';
import { pgPool } from '../../../infrastructure/connections.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = sub.metadata?.userId;
      const plan = sub.metadata?.plan || 'pro';
      const stripeSubId = sub.subscription;
      const customerId = sub.customer;

      await pgPool.query(
        `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_sub_id, plan, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id) DO UPDATE
         SET stripe_customer_id = $2, stripe_sub_id = $3, plan = $4, status = 'active', updated_at = NOW()`,
        [userId, customerId, stripeSubId, plan],
      );

      // Sync plan to users table
      await pgPool.query(
        `UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2`,
        [plan, userId],
      );
      break;
    }

    case 'customer.subscription.deleted': {
      await pgPool.query(
        `UPDATE subscriptions SET plan = 'free', status = 'cancelled', updated_at = NOW()
         WHERE stripe_sub_id = $1`,
        [sub.id],
      );
      // Downgrade user
      const result = await pgPool.query(
        `UPDATE users u SET plan = 'free', updated_at = NOW()
         FROM subscriptions s WHERE s.user_id = u.id AND s.stripe_sub_id = $1
         RETURNING u.id`,
        [sub.id],
      );
      break;
    }

    case 'invoice.payment_failed': {
      await pgPool.query(
        `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
         WHERE stripe_customer_id = $1`,
        [sub.customer],
      );
      break;
    }
  }

  return res.json({ received: true });
});

export default router;
```

#### P4-1.5 Settings/Billing page (client)

**New file:** `client/src/features/settings/pages/BillingPage.jsx`

```jsx
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0/mo',
    features: ['3 repos/month', '10 AI queries/day', 'Public repos only'],
    cta: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19/mo',
    features: ['Unlimited repos', '200 AI queries/day', 'Private repos', 'Priority support'],
    cta: 'Upgrade to Pro',
    priceId: import.meta.env.VITE_STRIPE_PRICE_PRO,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49/mo',
    features: ['Everything in Pro', '1000 AI queries/day', 'Team workspaces', 'Shared graphs'],
    cta: 'Upgrade to Team',
    priceId: import.meta.env.VITE_STRIPE_PRICE_TEAM,
  },
];

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState('free');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/billing/current', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCurrentPlan(d.plan || 'free'));
  }, []);

  const handleUpgrade = async (priceId, planName) => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, plan: planName }),
      });
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } catch {
      alert('Failed to create checkout session');
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    const res = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
    const { portalUrl } = await res.json();
    window.location.href = portalUrl;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Billing</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map(plan => (
          <Card key={plan.id} className={currentPlan === plan.id ? 'border-primary' : ''}>
            <CardHeader>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <p className="text-lg font-semibold">{plan.price}</p>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                {plan.features.map(f => <li key={f}>· {f}</li>)}
              </ul>
              {currentPlan === plan.id ? (
                <p className="text-xs text-muted-foreground font-medium">Current plan</p>
              ) : plan.cta ? (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleUpgrade(plan.priceId, plan.id)}
                  disabled={loading}
                >
                  {plan.cta}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {currentPlan !== 'free' && (
        <div className="mt-6">
          <Button variant="outline" size="sm" onClick={handleManage}>
            Manage subscription
          </Button>
        </div>
      )}
    </div>
  );
}
```

Add to `client/.env.example`:
```bash
VITE_STRIPE_PRICE_PRO=price_...
VITE_STRIPE_PRICE_TEAM=price_...
```

Register in `client/src/App.jsx` routes:
```jsx
<Route path="/settings/billing" element={<AuthGuard><BillingPage /></AuthGuard>} />
```

---

### Section P4-2: Team Workspaces

#### P4-2.1 Schema

**File:** `server/src/infrastructure/migrations/006_teams.sql`

```sql
CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  owner_id   UUID NOT NULL REFERENCES users(id),
  plan       TEXT NOT NULL DEFAULT 'team',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_repositories (
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, repository_id)
);
```

#### P4-2.2 Shared repo visibility

When `repositories.owner_id` refers to a team member, all members of that team can see the repo in their dashboard. Add a `team_id` column to `repositories`:

```sql
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
```

Modify the `GET /api/repositories` query to include repos from the user's team:

```sql
WHERE r.owner_id = $1
   OR r.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
```

#### P4-2.3 Team invite endpoint

```
POST /api/teams/:teamId/invite  → { inviteToken }
GET  /api/teams/join/:token     → joins team, redirects to dashboard
GET  /api/teams/:teamId/members → lists members with roles
PATCH /api/teams/:teamId/members/:userId → change role
DELETE /api/teams/:teamId/members/:userId → remove
```

---

### Section P4-3: Refactor Intelligence

#### P4-3.1 Complexity heatmap endpoint

**New route in** `server/src/api/graph/routes/graph.routes.js`:

```js
// GET /api/graph/:jobId/heatmap
// Returns nodes sorted by complexity: cyclomatic complexity × inDegree (fan-in)
router.get('/:jobId/heatmap', async (req, res, next) => {
  try {
    const result = await pgPool.query(
      `SELECT file_path, file_type, metrics,
              (metrics->>'inDegree')::int * COALESCE((metrics->>'complexity')::numeric, 1) AS risk_score
       FROM graph_nodes
       WHERE job_id = $1
       ORDER BY risk_score DESC
       LIMIT 50`,
      [req.params.jobId],
    );

    return res.json({
      hotspots: result.rows.map(row => ({
        filePath: row.file_path,
        type: row.file_type,
        riskScore: parseFloat(row.risk_score) || 0,
        inDegree: row.metrics?.inDegree || 0,
        loc: row.metrics?.loc || 0,
      })),
    });
  } catch (err) {
    return next(err);
  }
});
```

#### P4-3.2 AI refactor suggestions endpoint

**New route in** `server/src/api/ai/routes/ai.routes.js`:

```js
// POST /api/ai/suggest-refactor
// Body: { jobId, filePath }
// Returns: structured refactor recommendations for a high-complexity file
router.post('/suggest-refactor', requirePlan('pro', 'team'), async (req, res, next) => {
  const { jobId, filePath } = req.body;
  if (!jobId || !filePath) return res.status(400).json({ error: 'jobId and filePath are required.' });

  try {
    // Load node data
    const nodeResult = await pgPool.query(
      `SELECT file_path, file_type, declarations, metrics, summary
       FROM graph_nodes WHERE job_id = $1 AND file_path = $2`,
      [jobId, filePath],
    );
    if (nodeResult.rowCount === 0) return res.status(404).json({ error: 'File not found.' });

    const node = nodeResult.rows[0];
    const prompt = `You are a senior software architect reviewing a file in a dependency graph analysis.

File: ${node.file_path}
Type: ${node.file_type}
Lines of code: ${node.metrics?.loc || 'unknown'}
In-degree (files that import this): ${node.metrics?.inDegree || 0}
Out-degree (files this imports): ${node.metrics?.outDegree || 0}
Exports: ${(node.declarations || []).map(d => d.name).join(', ') || 'none'}
Summary: ${node.summary || 'no summary available'}

Respond with a JSON object:
{
  "concerns": ["list of specific architectural concerns"],
  "suggestions": ["list of concrete refactoring steps"],
  "priority": "high | medium | low",
  "estimatedEffort": "hours estimate as a string, e.g. '2–4 hours'"
}
Only respond with the JSON object.`;

    const response = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 400,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content.trim());
    } catch {
      result = { concerns: [], suggestions: [response.choices[0].message.content], priority: 'medium', estimatedEffort: 'unknown' };
    }

    return res.json({ filePath, ...result });
  } catch (err) {
    return next(err);
  }
});
```

#### P4-3.3 Client — Heatmap view in GraphToolbar

Add a toggle in `GraphToolbar.jsx` to switch between normal graph view and heatmap overlay. When enabled, the heatmap endpoint is called and node colours are overridden by risk score (green → yellow → red).

```jsx
// In GraphToolbar, add state:
const [heatmapMode, setHeatmapMode] = useState(false);

// Pass to GraphView via Redux or prop:
<Button
  variant={heatmapMode ? 'default' : 'outline'}
  size="sm"
  onClick={() => setHeatmapMode(m => !m)}
>
  Heatmap
</Button>
```

In `GraphView.jsx`, when `heatmapMode` is true, override node colour based on `metrics.inDegree * metrics.loc`:

```js
function riskToColor(inDegree = 0, loc = 0) {
  const score = inDegree * (loc / 100);
  if (score > 20) return '#ef4444';  // red
  if (score > 8)  return '#f59e0b';  // amber
  return '#22c55e';                   // green
}
```

---

### Section P4-4: GitHub Checks API (PR Status Checks)

Instead of (or in addition to) posting a comment, report CodeGraph impact analysis as a GitHub Checks status. This shows a green/red/neutral badge directly on the PR.

#### P4-4.1 Server

Add to `GitHubPRService.js`:

```js
async createCheckRun(owner, repo, sha, { conclusion, title, summary, detailsUrl }) {
  if (!this.isConfigured()) return;

  const response = await this.client.post(`/repos/${owner}/${repo}/check-runs`, {
    name: 'CodeGraph Impact Analysis',
    head_sha: sha,
    status: 'completed',
    conclusion, // 'success' | 'failure' | 'neutral'
    details_url: detailsUrl,
    output: { title, summary },
  });

  return response.data;
}
```

In `_tryPostPRComment()` in SupervisorAgent, after posting the comment, also create a check run:

```js
const sha = input?.github?.headSha; // add this to webhook payload
if (sha) {
  const conclusion = impactedFiles.size > 10 ? 'failure' : 'neutral';
  await GitHubPRService.createCheckRun(owner, repo, sha, {
    conclusion,
    title: `${impactedFiles.size} files potentially impacted`,
    summary: `${changedFiles.length} changed files affect ${impactedFiles.size} dependent files.`,
    detailsUrl: graphUrl,
  });
}
```

Update the webhook to also capture `head_sha`:

```js
// In github.webhook.js:
const headSha = payload?.pull_request?.head?.sha;
// Pass in input: { ...github: { owner, repo, branch, prNumber, prTitle, headSha } }
```

---

### Section P4-5: VS Code Extension

The VS Code extension brings the graph directly into the editor, letting developers see dependencies, impact, and AI explanations without leaving their IDE.

#### P4-5.1 Bootstrap the extension

```bash
npm install -g yo generator-code
yo code
# Choose: New Extension (TypeScript)
# Name: codegraph-ai
# Display name: CodeGraph AI
```

#### P4-5.2 Extension structure

```
vscode-extension/
├── src/
│   ├── extension.ts         ← activate(), register commands
│   ├── GraphPanel.ts        ← WebviewPanel showing React graph
│   ├── HoverProvider.ts     ← shows summary + deps on hover
│   └── ApiClient.ts         ← talks to CodeGraph backend
├── package.json             ← extension manifest, contributes
└── README.md
```

#### P4-5.3 Core extension code

**File:** `vscode-extension/src/extension.ts`

```typescript
import * as vscode from 'vscode';
import { GraphPanel } from './GraphPanel';
import { HoverProvider } from './HoverProvider';
import { ApiClient } from './ApiClient';

export function activate(context: vscode.ExtensionContext) {
  const apiClient = new ApiClient(
    vscode.workspace.getConfiguration('codegraphAi').get('serverUrl') || 'http://localhost:5000',
    vscode.workspace.getConfiguration('codegraphAi').get('apiToken') || ''
  );

  // Command: Open graph for current workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('codegraphAi.openGraph', async () => {
      const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!repoPath) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      GraphPanel.createOrShow(context.extensionUri, apiClient, repoPath);
    })
  );

  // Hover: show file summary + dep count
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'python', 'go'],
      new HoverProvider(apiClient)
    )
  );
}

export function deactivate() {}
```

**File:** `vscode-extension/src/HoverProvider.ts`

```typescript
import * as vscode from 'vscode';
import { ApiClient } from './ApiClient';

export class HoverProvider implements vscode.HoverProvider {
  constructor(private api: ApiClient) {}

  async provideHover(document: vscode.TextDocument): Promise<vscode.Hover | null> {
    const jobId = this.api.currentJobId;
    if (!jobId) return null;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const relativePath = document.uri.fsPath.replace(workspaceRoot + '/', '');

    try {
      const graph = await this.api.getGraph(jobId);
      const node = graph?.graph?.[relativePath];
      if (!node) return null;

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.appendMarkdown(`**CodeGraph AI** — \`${relativePath}\`\n\n`);
      if (node.summary) markdown.appendMarkdown(`${node.summary}\n\n`);
      markdown.appendMarkdown(`- **Deps:** ${node.deps?.length || 0}  `);
      markdown.appendMarkdown(`**Used by:** ${Object.values(graph.graph).filter((n: any) => n.deps?.includes(relativePath)).length}\n\n`);
      markdown.appendMarkdown(`[Open in Graph](command:codegraphAi.openGraph)`);

      return new vscode.Hover(markdown);
    } catch {
      return null;
    }
  }
}
```

**File:** `vscode-extension/package.json` — key fields:

```json
{
  "contributes": {
    "commands": [
      { "command": "codegraphAi.openGraph", "title": "CodeGraph AI: Open Graph" }
    ],
    "configuration": {
      "title": "CodeGraph AI",
      "properties": {
        "codegraphAi.serverUrl": {
          "type": "string",
          "default": "http://localhost:5000",
          "description": "CodeGraph AI server URL"
        },
        "codegraphAi.apiToken": {
          "type": "string",
          "default": "",
          "description": "JWT token for authentication"
        }
      }
    }
  },
  "activationEvents": ["workspaceContains:**/*.{js,ts,jsx,tsx,py,go}"]
}
```

---

### Phase 4 Build Sequence

| Sprint | Section | Duration | What ships |
|---|---|---|---|
| 1 | P4-1 Stripe | 3 days | Checkout, billing page, webhook, plan sync |
| 2 | Phase 3 Bug Fixes 1–8 | 1 day | All 8 bugs resolved, PR flow working |
| 2 | P4-4 GitHub Checks | 1 day | Green/red check on PRs |
| 3 | P4-2 Teams | 4 days | Team schema, invite flow, shared repos |
| 4 | P4-3 Refactor Intel | 2 days | Heatmap endpoint + toggle + AI suggestions |
| 5 | P4-5 VS Code Extension | 5 days | Hover provider, graph WebviewPanel |

---

### New Env Variables Added in Phase 4

**`server/.env`:**
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
```

**`client/.env`:**
```bash
VITE_STRIPE_PRICE_PRO=price_...
VITE_STRIPE_PRICE_TEAM=price_...
```

**`vscode-extension/.vscodeignore` and `package.json`:**  
Publish to the VS Code Marketplace via `vsce package && vsce publish`.

---

### New Files Summary

```
server/
└── src/
    ├── api/
    │   └── billing/
    │       ├── billing.routes.js       ← checkout + portal
    │       └── stripe.webhook.js       ← plan sync from Stripe events
    └── infrastructure/migrations/
        ├── 004_analysis_jobs_metadata.sql  ← adds metadata col + audit_logs
        ├── 005_billing.sql                 ← subscriptions + usage_events
        └── 006_teams.sql                   ← teams + members + team_repos

client/
└── src/features/settings/
    └── pages/BillingPage.jsx               ← billing UI

vscode-extension/                           ← new root folder
├── src/
│   ├── extension.ts
│   ├── GraphPanel.ts
│   ├── HoverProvider.ts
│   └── ApiClient.ts
└── package.json
```

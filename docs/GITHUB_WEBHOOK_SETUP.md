# GitHub PR Integration — Webhook Setup Guide

This guide walks through configuring GitHub PR webhooks for CodeGraph AI's automated code analysis on pull requests.

## Overview

When a pull request is opened or updated, GitHub sends a webhook event to CodeGraph. The webhook triggers an automatic analysis of the PR's branch, and the system can post impact analysis comments back to the PR.

**Events triggered:**
- `pull_request:opened` — new PR created
- `pull_request:synchronize` — commits pushed to existing PR

## Prerequisites

- CodeGraph server deployed and accessible via HTTPS URL (e.g., `https://codegraph.example.com`)
- GitHub repository admin access to configure webhooks
- `GITHUB_WEBHOOK_SECRET` environment variable configured on the server

## Step 1: Generate Webhook Secret

Generate a cryptographically-secure random secret:

```bash
# On your development or server machine
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Output example:
```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

## Step 2: Configure Server Environment

Add the generated secret to your server `.env` file:

```bash
GITHUB_WEBHOOK_SECRET=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

**Important:** Keep this secret secure. Do not commit it to version control or share it publicly.

## Step 3: Register Webhook in GitHub

### Via GitHub Web UI

1. Navigate to your repository: `https://github.com/owner/repo`
2. Click **Settings** (top menu)
3. Select **Webhooks** (left sidebar)
4. Click **Add webhook**

### Webhook Configuration Form

Fill in the following fields:

| Field | Value |
|-------|-------|
| **Payload URL** | `https://codegraph.example.com/api/webhooks/github` |
| **Content type** | `application/json` |
| **Secret** | Paste your generated secret (from Step 1) |
| **Which events would you like to trigger this webhook?** | Select **Let me select individual events** |
| **Events to select** | Check only **Pull Requests** |
| **Active** | ✓ Checked |

### Fine-Grained Events (Optional - for newer GitHub UI)

If using GitHub's newer event selection interface:

- ✓ `pull_request` — triggered on all PR actions including `opened` and `synchronize`

### Legacy Event Selection

If you see the older interface:

- ✓ **Pull request** event
- Do NOT select: Push, Issues, Comments, etc.

### Complete and Save

Click **Add webhook** to save. GitHub will immediately send a test `ping` event to verify the endpoint is reachable.

## Step 4: Verify Webhook Registration

### Check Server Logs

Look for a successful response log entry (no errors):

```bash
# Server should log:
# POST /api/webhooks/github 200 OK
# Webhook received: pull_request event with action: opened
```

### Verify in GitHub

1. Return to **Settings > Webhooks** in your repository
2. Click the webhook you just added
3. Scroll to **Recent Deliveries** section
4. Click the most recent delivery to see the payload and response
5. Confirm:
   - **Status: Delivered** (green checkmark)
   - **Response status: 20x** (200, 201, etc.)

## Step 5: Test the Webhook

### Create a Test PR

1. Create a new branch with a test code change:
   ```bash
   git checkout -b test/webhook-integration
   echo "// Test file" > test-file.js
   git add .
   git commit -m "test: verify webhook"
   git push origin test/webhook-integration
   ```

2. Open a pull request against `main` or your default branch

3. Check the server logs or database:
   ```bash
   # Logs should show:
   # Webhook: PR opened in test/webhook-integration
   # Created analysis job: job_<id>
   # Queued for analysis
   ```

4. Verify the job was created:
   ```bash
   # Connect to database and query:
   SELECT id, status, branch FROM analysis_jobs 
   WHERE branch = 'test/webhook-integration' 
   ORDER BY created_at DESC LIMIT 1;
   ```

## Step 6: Database Schema Requirement

Ensure these tables exist in your PostgreSQL database:

```sql
-- Should already exist from Phase 2 migrations
CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY,
  github_owner TEXT,
  github_repo TEXT,
  owner_id UUID REFERENCES users(id),
  -- ... other fields ...
  UNIQUE(github_owner, github_repo)
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id UUID PRIMARY KEY,
  repository_id UUID REFERENCES repositories(id),
  user_id UUID REFERENCES users(id),
  branch TEXT,
  status TEXT,
  -- ... other fields ...
);
```

## Troubleshooting

### Webhook Receives 401 Unauthorized

**Cause:** Invalid or missing signature

**Solution:**
1. Verify the `GITHUB_WEBHOOK_SECRET` matches exactly between GitHub webhook UI and server `.env`
2. Ensure the secret is correctly formatted (64-character hex string if using the script above)
3. Check server logs for signature verification errors:
   ```bash
   tail -f logs/server.log | grep "signature"
   ```

### Webhook Receives 400 Bad Request

**Cause:** Malformed or incomplete payload

**Solution:**
1. Check that the PR has `pull_request.head.ref` (branch name)
2. Verify repository owner/name match GitHub values
3. Enable detailed logging in `app.js`:
   ```js
   console.log('Webhook payload:', JSON.stringify(payload, null, 2));
   ```

### Webhook Receives 503 Service Unavailable

**Cause:** Server is not configured with the webhook secret

**Solution:**
1. Add `GITHUB_WEBHOOK_SECRET` to your `.env` file
2. Restart the server: `npm start` or similar
3. Test the webhook again from GitHub's Webhooks UI

### Repository Not Tracked Error (200 OK)

**Cause:** PR is in a GitHub repo not yet added to CodeGraph

**Solution:**
1. Log in to CodeGraph UI
2. Add the repository via Dashboard → "Add Repository"
3. Select the GitHub repo from the list
4. Re-send the webhook test from GitHub's Webhooks UI

### Analysis Job Not Running

**Cause:** Queue worker might not be processing jobs

**Solution:**
1. Verify Redis is running: `redis-cli PING` should return `PONG`
2. Check Bull queue status:
   ```bash
   redis-cli
   > KEYS "bull:code-analysis:*"
   ```
3. View worker logs:
   ```bash
   tail -f logs/worker.log | grep "code-analysis"
   ```

## Production Considerations

### IP Whitelisting

GitHub webhook servers use dynamic IPs. Instead, always verify signatures (the code does this automatically).

### Rate Limiting

Configure rate limiting if you expect many PRs:

```bash
# In server/.env
WEBHOOK_RATE_LIMIT_PER_MINUTE=100
```

### Secret Rotation

To rotate the webhook secret:

1. Generate a new secret (Step 1)
2. Update `.env`: `GITHUB_WEBHOOK_SECRET=new_secret`
3. Restart server
4. Update GitHub webhook UI with the new secret
5. Test a new PR to confirm

### Monitoring

Add monitoring/alerting for webhook failures:

```bash
# View failed webhooks in GitHub UI:
# Settings > Webhooks > [Your Webhook] > Recent Deliveries
# Filter by "Failed Deliveries"
```

Set up server-side monitoring:

```js
// In errorHandler.middleware.js
if (req.path.includes('/webhooks')) {
  console.error(`Webhook error: ${err.message}`);
  // Send alert to Sentry/monitoring service
}
```

## Security Considerations

1. **Never log the secret**: The code uses timing-safe comparison to prevent timing attacks
2. **Always use HTTPS**: Webhooks must be HTTPS only (HTTP will fail in GitHub)
3. **Validate signatures**: Always verify GitHub's signature before processing
4. **Database transactions**: Ensure idempotency in case GitHub retries a webhook
5. **Rate limits**: Don't create analysis jobs faster than your queue can process

## Related Documentation

- [GitHub Webhooks API Reference](https://docs.github.com/en/developers/webhooks-and-events/webhooks/about-webhooks)
- [Webhook Payload Examples](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#pull_request)
- CodeGraph Phase 3 Implementation Guide: Section 8

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs: `tail -f logs/error.log`
3. Test signature generation locally: `node -e "console.log(require('crypto').createHmac('sha256', 'secret').update('payload').digest('hex'))"`

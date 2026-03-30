# Phase 3 Implementation Notes

This document captures the production implementation details for the following Phase 3 features:

1. Function-level graph
2. Streaming AI response
3. Multi-language parser support
4. Saved queries UI
5. Shareable graph links
6. Test suite

The focus is on what was actually added to the codebase, how it behaves, and what protects existing functionality.

---

## 1) Function-Level Graph

### What was added

- Parser output now includes `functionNodes` for JS/TS files.
- Function metadata is persisted in a dedicated `function_nodes` table.
- Graph API exposes function nodes per file.
- Graph UI supports double-click expansion of a file node into child function nodes.

### Backend implementation

#### AST extraction and function call mapping

- `server/src/agents/parser/parseWorker.js`
  - Added extraction of:
    - function declarations
    - class declarations
    - variable-bound arrow/function expressions
  - Added function-level records:
    - `name`
    - `kind` (`function`, `class`, `arrow`)
    - `calls` (callee names constrained to known declarations)
    - `loc` (line count)

#### Storage

- `server/src/infrastructure/migrations/002_function_nodes.sql`
  - Creates `function_nodes` with:
    - `job_id`, `file_path`, `name`, `kind`, `calls`, `loc`
    - `UNIQUE (job_id, file_path, name)`
    - index on `(job_id, file_path)`

- `server/src/agents/persistence/PersistenceAgent.js`
  - Bulk upserts function nodes into `function_nodes`.
  - Includes function node write counts in persistence metrics.

#### API

- `server/src/api/graph/routes/graph.routes.js`
  - Added endpoint:
    - `GET /api/graph/:jobId/functions/*filePath`
  - Behavior:
    - validates `jobId` and `filePath`
    - decodes wildcard file path safely
    - returns ordered function list with normalized `calls` and `loc`

### Frontend implementation

- `client/src/features/graph/services/graphService.js`
  - Added `getFunctionNodes(jobId, filePath)`

- `client/src/features/graph/components/GraphView.jsx`
  - Added `onNodeDoubleClick` behavior:
    - fetch function declarations once per expanded file node
    - inject child nodes and connecting edges
    - dedupe node/edge IDs to avoid duplicates
    - preserve existing graph behavior and selection logic

### Compatibility / non-breaking behavior

- Existing file-level graph rendering remains unchanged.
- Expansion is additive and opt-in (double-click only).
- Errors in function node loading are isolated and do not break base graph rendering.

---

## 2) Streaming AI Response

### What was added

- Server-side SSE endpoint for incremental AI explanation output.
- Client streaming parser for SSE chunks.
- AI panel UI updated to render streamed text live.

### Backend implementation

- `server/src/api/ai/routes/ai.routes.js`
  - Added endpoint:
    - `POST /api/ai/explain/stream`
  - Guardrails:
    - authentication required
    - `question` and `jobId` required
    - verifies job ownership (`analysis_jobs.user_id`)
    - fails fast if OpenAI client not configured
  - Streaming behavior:
    - sets SSE headers (`text/event-stream`, no-cache, keep-alive)
    - streams OpenAI delta tokens as `data: {"text":"..."}`
    - emits terminal `data: [DONE]`
    - handles client disconnect by aborting stream
    - emits structured `error` payload when needed

### Frontend implementation

- `client/src/features/ai/services/aiService.js`
  - Added `streamExplain({ question, jobId, onChunk, onDone, onError, signal })`
  - Handles:
    - fetch lifecycle and auth cookies
    - SSE line framing (`data: ...`)
    - JSON payload parsing
    - malformed chunk tolerance
    - completion and error callbacks

- `client/src/features/ai/components/AiPanel.jsx`
  - Added local streaming state:
    - `streamedText`
    - `isStreaming`
    - `streamError`
  - On node change:
    - starts a new stream
    - aborts previous stream on cleanup
    - accumulates text incrementally
  - UI:
    - loading indicator while streaming
    - inline error state
    - streamed content rendered with `whitespace-pre-wrap`

### Compatibility / non-breaking behavior

- Streaming is scoped to explain panel behavior; no changes to core graph query endpoints.
- Abort controller cleanup prevents memory leaks and stale updates.
- Fallback summary still displays when no stream content is present.

---

## 3) Multi-Language Parser Support

### What was added

- Scanner now includes Python and Go files.
- Parser routes file parsing to language-specific workers.
- New workers for Python and Go import/declaration extraction.
- Graph import resolution now recognizes `.py` and `.go` local modules.

### Backend implementation

#### Scanner extension support

- `server/src/agents/scanner/ScannerAgent.js`
  - Added allowed extensions:
    - `.py`
    - `.go`

#### Parser language routing

- `server/src/agents/parser/ParserAgent.js`
  - `_parseInWorker` routes by extension:
    - `.py` -> `pythonWorker.js`
    - `.go` -> `goWorker.js`
    - otherwise -> existing `parseWorker.js`

#### Python worker

- `server/src/agents/parser/pythonWorker.js`
  - Extracts:
    - imports (`import ...`, `from ... import ...`) with normalized relative targets
    - declarations (`def`, `async def`, `class`)
    - metrics (`loc`, counts)
  - Returns parser-safe shape even on failure.

#### Go worker

- `server/src/agents/parser/goWorker.js`
  - Extracts:
    - imports from single and grouped import statements
    - declarations for `func`, `struct`, `interface`, and type aliases
    - metrics (`loc`, counts)
  - Returns parser-safe shape even on failure.

#### Graph resolution updates

- `server/src/agents/graph/GraphBuilderAgent.js`
  - Added `.py` and `.go` to local resolution extension list.

### Compatibility / non-breaking behavior

- Existing JS/TS worker path remains the default.
- Worker-level failures are surfaced as parse errors without crashing the pipeline.
- New language support is additive to current ingestion/parsing behavior.

---

## 4) Saved Queries UI

### What was added

- API endpoint for paginated query history retrieval.
- Client service method for query history.
- New collapsible query history panel under the query bar.
- One-click rerun of historical query prompts.

### Backend implementation

- `server/src/api/ai/routes/ai.routes.js`
  - Added endpoint:
    - `GET /api/ai/queries?jobId=&page=&limit=`
  - Behavior:
    - requires authentication
    - resolves DB user id
    - optional job ownership check when `jobId` is provided
    - returns paginated saved query rows sorted by `created_at DESC`

- Existing persistence path (already present, used by this feature):
  - `server/src/agents/query/QueryAgent.js`
  - Uses `_saveQuery(...)` into `saved_queries`

### Frontend implementation

- `client/src/features/ai/services/aiService.js`
  - Added `getQueryHistory({ jobId, page, limit })`

- `client/src/features/ai/components/QueryHistory.jsx`
  - Added collapsible `Recent queries` panel:
    - load on `jobId` change
    - loading and error states
    - relative timestamp display
    - refresh action
    - rerun query via `dispatch(queryGraph(...))`

- `client/src/features/graph/pages/GraphPage.jsx`
  - Mounted `QueryHistory` below `QueryBar` in graph workspace header panel.

### Compatibility / non-breaking behavior

- Query history is read-only UI enhancement; does not change query execution contract.
- Rerun reuses existing `queryGraph` thunk and highlight flow.

---

## 5) Shareable Graph Links

### What was added

- Share token persistence table and migration.
- API to create share links for a job.
- Public API to resolve a token into graph payload.
- Client methods to create/load shared graphs.
- Toolbar share action and automatic shared graph loading by URL token.

### Backend implementation

#### Storage

- `server/src/infrastructure/migrations/003_share_tokens.sql`
  - Creates `graph_shares` with:
    - `job_id`, `token`, `visibility`, `expires_at`, `created_at`
    - token uniqueness and token index

#### Share creation

- `server/src/api/graph/routes/graph.routes.js`
  - Added endpoint:
    - `POST /api/graph/:jobId/share`
  - Behavior:
    - validates `visibility` (`unlisted` or `public`)
    - optional expiry validation
    - secure token generation (`crypto.randomBytes(...).toString('base64url')`)
    - returns `token`, `visibility`, `expiresAt`, and computed `shareUrl`

#### Public share retrieval

- `server/src/api/share/routes/share.routes.js`
  - Added endpoint:
    - `GET /api/share/:token`
  - Behavior:
    - validates token
    - checks token existence and expiry
    - loads graph payload via existing graph payload service
    - returns graph data plus `share` metadata

### Frontend implementation

- `client/src/features/graph/services/graphService.js`
  - Added:
    - `shareGraph(jobId, options)`
    - `getSharedGraph(token)`

- `client/src/features/graph/components/GraphToolbar.jsx`
  - Added `Share` button:
    - calls share API
    - copies URL to clipboard (with fallback copy path)
    - displays success/error feedback
    - loading state while sharing

- `client/src/features/graph/slices/graphSlice.js`
  - Added `loadSharedGraph` async thunk to hydrate state from token.

- `client/src/features/graph/pages/GraphPage.jsx`
  - Reads `?share=...` query param and dispatches `loadSharedGraph`.

### Compatibility / non-breaking behavior

- Existing authenticated graph loading remains unchanged.
- Shared graph load is activated only when `share` token is present.
- Error handling prevents invalid/expired token failures from crashing the page.

---

## 6) Test Suite

### What was added

- Vitest setup for agent-focused unit coverage.
- New unit tests for confidence logic, supervisor control flow, parser language routing, and graph builder output.
- Existing node:test integration tests retained and still usable.
- Coverage reporting generated to `server/coverage/`.

### Configuration

- `server/vitest.config.js`
  - Node test environment
  - Includes `src/agents/**/__tests__/*.test.js`
  - Coverage provider `v8`, reporters `text` and `lcov`
  - Thresholds:
    - lines: 70
    - functions: 70
    - branches: 60

- `server/package.json`
  - Added scripts:
    - `test:unit`
    - `test:coverage`
  - Added dev dependencies:
    - `vitest`
    - `@vitest/coverage-v8`
    - `supertest`

### Added tests

- `server/src/agents/core/__tests__/confidence.test.js`
  - confidence formulas and helper behavior

- `server/src/agents/core/__tests__/SupervisorAgent.test.js`
  - proceed/warn/retry/abort supervision behavior

- `server/src/agents/parser/__tests__/ParserAgent.test.js`
  - Python/Go worker routing and parse results

- `server/src/agents/graph/__tests__/GraphBuilderAgent.test.js`
  - graph edge construction and function-node output persistence shape

### Current verification state

- `npm run test:coverage` has been executed successfully in `server`.
- Coverage artifacts are present under `server/coverage/`.

---

## Operational Notes

### Migration order

Run backend migrations in sequence:

1. `001_initial.sql`
2. `002_function_nodes.sql`
3. `003_share_tokens.sql`

The existing `server/package.json` migrate script already includes these.

### Backward compatibility summary

- All six features were implemented as additive capabilities.
- Existing endpoints and base graph/query workflows remain intact.
- New features are opt-in by interaction (double-click, share button, `?share=...`) or by new endpoint usage.

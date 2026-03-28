# Phase 2

## Sprint 1 : Infrastructure foundation - replace the monolith with agents

Why Sprint 1 before any AI features: The existing analyze.service.js is a synchronous monolith — it blocks the HTTP response for the entire duration of parsing. Adding AI features on top of that means the HTTP request would have to wait 30 seconds for parsing plus 5–10 seconds for LLM calls. That's a broken user experience. Sprint 1 converts the system to async (BullMQ queue → SSE stream) so Phase 2's AI work can happen in the background without ever touching the HTTP layer. This also means the client gets real-time progress per agent instead of a spinner.

### Install server deps:
npm install pg ioredis bullmq openai @pgvector/pg

## Run DB migrations:
Run this in your project root:
```
docker run -d ^
  --name codegraph-postgres ^
  -e POSTGRES_USER=postgres ^
  -e POSTGRES_PASSWORD=postgres ^
  -e POSTGRES_DB=codegraph ^
  -p 5433:5432 ^
  ankane/pgvector
```
Using 5433 as 5432 maybe used by local PostgreSQL

Verify it:
```
docker ps
```

Now run migration:
``` 
psql -h localhost -p 5433 -U postgres -d codegraph -f ./server/src/infrastructure/migrations/001_initial.sql
```
Enter password `postgres`

## Further onwards:
```
docker start codegraph-postgres
docker stop codegraph-postgres
```


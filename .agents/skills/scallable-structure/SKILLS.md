# 🧠 AI AGENT SKILLS: FULL-STACK MODULAR ARCHITECTURE

## 🎯 PURPOSE
This document converts the **Full-Stack Modular Feature Architecture Guide** into actionable **AI Agent Skills**.

Each skill represents a reusable capability that an AI engineer, autonomous agent, or system can execute when designing, reviewing, or generating production-grade systems.

---

# 🧩 CORE META-SKILL

## 🧠 Skill: Feature-Oriented System Design

### Objective
Design systems organized by **feature modules**, not technical layers.

### Rules
- Group by business capability (`auth`, `inventory`, `analytics`)
- Each feature is **self-contained**
- Avoid global layer separation (`controllers/`, `services/`, `models/`)

### Output Pattern
```

features/
├── <feature_name>/
├── ui / routes
├── logic / service
├── state / slice
├── data / repository

```

### Constraints
- No cross-feature coupling
- Each feature is microservice-ready

---

# 🖥 CLIENT-SIDE SKILLS (React + Redux)

---

## ⚛️ Skill: Client Feature Module Generator

### Objective
Generate a scalable frontend feature module.

### Output Structure
```

features/<feature>/
├── pages/
├── components/
├── <feature>Slice.js
├── <feature>API.js
├── <feature>Hooks.js
└── index.js

```

### Rules
- Co-locate logic, UI, and state
- No shared business logic across features

---

## 🧠 Skill: Redux Store Architect

### Objective
Create a clean, scalable global store.

### Rules
- Single store in `app/store.js`
- Use Redux Toolkit
- Combine feature slices

### Anti-Patterns
- ❌ Multiple stores
- ❌ Global reducers outside features

---

## 🔄 Skill: Client Data Flow Enforcer

### Enforced Flow
```

Component → Hook → Slice → API → Backend

```

### Constraints
- No direct API calls from components
- Hooks abstract business logic

---

## 📦 Skill: State Normalization Engine

### Objective
Normalize Redux state for scalability.

### Pattern
```

{
ids: [],
entities: {}
}

```

### Benefits
- O(1) lookup
- Prevent duplication
- Easier updates

---

## 🚫 Skill: Redux Anti-Pattern Detector

### Detect & Prevent
- Dispatch in uncontrolled `useEffect`
- API calls inside components
- Deeply nested state
- Cross-feature slice usage

---

## 🧪 Skill: Side Effect Isolation

### Rules
- Use `createAsyncThunk` or RTK Query
- Side effects only in thunks

---

## 🧠 Skill: Selector Optimization

### Objective
Optimize performance

### Rules
- Use memoized selectors (Reselect)
- Avoid recomputation

---

# 🖧 SERVER-SIDE SKILLS (Node + Express)

---

## 🏗 Skill: Backend Feature Module Generator

### Output Structure
```

features/<feature>/
├── <feature>.routes.js
├── <feature>.service.js
├── <feature>.repository.js
├── <feature>.schema.js
└── index.js

```

---

## 🔄 Skill: Request Flow Orchestrator

### Enforced Flow
```

Route → Service → Repository → Database

```

---

## 🧠 Skill: Thin Controller Enforcer

### Rules
- Routes only:
  - Handle HTTP
  - Call service
- No business logic

---

## ⚙️ Skill: Business Logic Isolation

### Rules
- All logic in `service`
- Includes:
  - Validation
  - Transformations
  - Orchestration

---

## 🗄 Skill: Repository Pattern Executor

### Rules
- Only DB queries
- No logic
- No validation

---

## 🚫 Skill: Dependency Boundary Enforcer

### Prevent
- Circular dependencies
- Cross-feature DB access

---

# 🗃 DATABASE SKILLS

---

## 🐘 Skill: Relational DB Selector (PostgreSQL)

### Use When
- Structured data
- Transactions
- Relationships

---

## 🍃 Skill: Document DB Selector (MongoDB)

### Use When
- Logs
- Analytics
- Flexible schemas

---

## 🔥 Skill: Realtime Backend Selector (Firebase)

### Use When
- Auth
- Notifications
- Live updates

---

## 🧱 Skill: Database Integrity Enforcer

### Rules
- Use indexes
- Validate foreign keys
- Use transactions
- Version migrations

---

# 🔐 AUTHENTICATION SKILLS

---

## 🔑 Skill: JWT Auth System Builder

### Components
- Access Token (short-lived)
- Refresh Token (long-lived)

---

## 🔄 Skill: Token Rotation Engine

### Rules
- Store refresh tokens in DB
- Rotate on every refresh
- Invalidate on logout

---

# 🐍 FASTAPI SKILLS

---

## ⚡ Skill: FastAPI Feature Module Generator

### Output Structure
```

features/<feature>/
├── routes.py
├── service.py
├── repository.py
└── schema.py

```

---

## 🔄 Skill: Python Backend Flow Enforcer

Same as Node:
```

Route → Service → Repository → DB

```

---

# 🤖 AI AGENT SYSTEM SKILLS

---

## 🧠 Skill: Agent Feature Module Generator

### Output Structure
```

agents/features/<agent>/
├── pipeline.js
├── prompts.js
├── memory.js
└── index.js

```

---

## 🔄 Skill: Agent Pipeline Builder

### Pipeline
```

Input
→ Memory Retrieval
→ Prompt Builder
→ LLM Call
→ Action Executor
→ Persist

```

---

## 🧠 Skill: Prompt Management System

### Rules
- Separate prompts from logic
- Version prompts

---

## 💾 Skill: Memory System Architect

### Capabilities
- Store conversation state
- Retrieve relevant context
- Optimize token usage

---

## 🔍 Skill: Observability & Logging System

### Requirements
- Track inputs/outputs
- Log failures
- Monitor latency

---

## 🔁 Skill: Retry & Failover Mechanism

### Rules
- Retry failed LLM calls
- Add fallback logic

---

## 🔌 Skill: LLM Provider Abstraction

### Objective
Decouple model provider

### Benefit
- Swap models without rewriting logic

---

# 📈 SCALABILITY SKILLS

---

## 🧩 Skill: Feature Isolation Enforcer

### Rules
- No shared DB across features
- No shared state
- No hidden dependencies

---

## 🚀 Skill: Microservice Readiness Validator

### Ensure
- Feature can be extracted independently
- No tight coupling

---

## 📬 Skill: Async Architecture Planner

### Future Add-ons
- Message queues (Kafka / RabbitMQ)
- Event-driven systems

---

## ⚡ Skill: Caching Strategy Designer

### Tool
- Redis

### Use Cases
- API caching
- Session storage
- Rate limiting

---

# ✅ SYSTEM VALIDATION SKILLS

---

## 🧪 Skill: Frontend Audit Agent

### Checklist
- Store only in `app/`
- Feature isolation enforced
- APIs separated
- Redux normalized

---

## 🧪 Skill: Backend Audit Agent

### Checklist
- Feature modules exist
- Thin routes
- Logic in services
- DB only in repositories

---

## 🧪 Skill: Database Audit Agent

### Checklist
- Indexed columns
- Transactions used
- Migrations versioned

---

## 🧪 Skill: Auth Audit Agent

### Checklist
- Token expiry enforced
- Refresh rotation working
- Logout invalidation implemented

---

## 🧪 Skill: AI Agent Audit System

### Checklist
- Prompt versioning
- Logging enabled
- Fallbacks exist
- Memory implemented

---

# 🧠 META PRINCIPLES (ENFORCED BY ALL AGENTS)

---

## 🧱 Principle: Build for Scale

Systems must support:
- 10 engineers
- 100k users
- 5+ years growth

---

## 🚫 Principle: No Shortcuts

- No quick hacks
- No tight coupling
- No unstructured growth

---

## 🧩 Principle: Modularity First

Everything must be:
- Replaceable
- Testable
- Isolated

---

## 🔥 Principle: Feature Ownership

Each feature:
- Owns its logic
- Owns its data
- Owns its lifecycle

---

# 🚀 END STATE

An AI system with these skills can:

- Generate full-stack production architectures
- Enforce best practices automatically
- Scale systems cleanly
- Prevent technical debt at design time

---

# 📌 NEXT EXTENSIONS (OPTIONAL SKILLS)

- System Design Diagram Generator
- CI/CD Pipeline Builder
- Testing Strategy Generator
- DevOps Infrastructure Planner
- Codebase Refactor Agent

---

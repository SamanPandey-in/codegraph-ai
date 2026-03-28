# 🚀 codegraph-ai

AI-powered codebase visualizer that maps dependencies, explains architecture, and answers natural language questions about your repository.

---

# 🧠 Features

* 📊 Graph-based code analysis
* 🔗 Dependency visualization
* 🤖 AI-powered explanations (via embeddings)
* 💬 Natural language querying of your codebase
* ⚡ Queue processing with Redis
* 🧩 Vector search using pgvector

---

# 🏗️ Tech Stack

* **Backend:** Node.js + Express
* **Frontend:** SPA (client)
* **Database:** PostgreSQL + pgvector
* **Queue:** Redis (BullMQ)
* **AI:** OpenAI embeddings

---

# 📁 Project Structure

```
codegraph-ai/
├── client/        # Frontend SPA
├── server/        # Backend API
├── docker-compose.yml
└── README.md
```

---

# ⚙️ Local Development Setup

## 1. Install dependencies

### Backend

```bash
cd server
npm install
```

### Frontend

```bash
cd client
npm install
```

---

# 🐳 Docker Setup (Recommended)

This project uses Docker to run:

* PostgreSQL (with pgvector)
* Redis
* Backend

---

## ▶️ Start everything

```bash
docker compose up -d
```

---

## 🛑 Stop everything

```bash
docker compose down
```

---

## 🔄 Reset database (if needed)

```bash
docker compose down -v
```

---

# 🧱 Database Setup

## Run migration (only once)

```bash
psql -h localhost -p 5433 -U postgres -d codegraph -f ./server/src/infrastructure/migrations/001_initial.sql
```

Password:

```
postgres
```

---

## 🧠 Notes

* PostgreSQL runs on: `localhost:5433`
* Redis runs on: `localhost:6379`
* Backend runs on: `localhost:3000`

---

# 🔌 Environment Variables (Backend)

Create `server/.env`:

```
DATABASE_URL=postgres://postgres:postgres@postgres:5432/codegraph
REDIS_URL=redis://redis:6379
OPENAI_API_KEY=your_key_here
```

---

# 🧪 Running Without Docker (optional)

### Start PostgreSQL + Redis manually

Then:

```bash
cd server
npm run migrate
npm run dev
```

---

# 🎨 Frontend (Client)

## Dev mode

```bash
cd client
npm run dev
```

---

## Build for production

```bash
cd client
npm run build
```

---

# 🌐 Production SPA Fallback

To avoid:

```
Cannot GET /analyze
```

---

## ✅ Option 1: Express fallback (already implemented)

In production (`NODE_ENV=production`), backend serves `client/dist`.

### Build frontend:

```bash
cd client
npm run build
```

### Start backend:

```bash
cd server
npm start
```

---

## ✅ Option 2: Nginx (recommended)

```nginx
server {
	listen 80;
	server_name your-domain.com;

	root /var/www/codegraph-ai/client/dist;
	index index.html;

	location /api/ {
		proxy_pass http://127.0.0.1:5000;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}

	location /health {
		proxy_pass http://127.0.0.1:5000;
	}

	location /analyze {
		try_files $uri /index.html;
	}

	location / {
		try_files $uri $uri/ /index.html;
	}
}
```

---

# 🧰 Useful Commands

### View logs

```bash
docker compose logs -f
```

### Restart backend only

```bash
docker compose restart backend
```

### Rebuild containers

```bash
docker compose up -d --build
```

---

# ⚠️ Common Issues

### ❌ `vector extension not available`

✔ Fixed by using pgvector Docker image

---

### ❌ `Cannot GET /route`

✔ Use SPA fallback (Express or Nginx)

---

### ❌ DB connection fails

✔ Ensure backend uses:

```
postgres://postgres:postgres@postgres:5432/codegraph
```

---

# 🚀 Future Improvements

* Migration versioning (Prisma / Knex)
* Auth system expansion
* Multi-repo analysis
* Graph UI enhancements
* Background job monitoring

---

# 🤝 Contributing

PRs welcome. Open an issue first for major changes.

---

# 📜 License

MIT

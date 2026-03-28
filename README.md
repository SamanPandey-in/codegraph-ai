# codegraph-ai
AI-powered codebase visualizer that maps dependencies, explains architecture, and answers natural language questions about your repository.

## Production SPA Fallback

To avoid `Cannot GET /analyze` on browser refresh, use one of these setups:

### 1. Express fallback (already wired)

In production (`NODE_ENV=production`), the backend now serves `client/dist` and falls back to `index.html` for non-API HTML routes.

Build command:

```bash
cd client
npm run build
```

Then run backend:

```bash
cd server
npm start
```

### 2. Nginx rewrite rules (recommended)

If frontend is hosted behind Nginx, configure SPA routing fallback:

```nginx
server {
	listen 80;
	server_name your-domain.com;

	root /var/www/codegraph-ai/client/dist;
	index index.html;

	# API proxy to backend server
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
		proxy_http_version 1.1;
		proxy_set_header Host $host;
	}

	location /analyze {
		try_files $uri /index.html;
	}

	# SPA fallback for all frontend routes
	location / {
		try_files $uri $uri/ /index.html;
	}
}
```

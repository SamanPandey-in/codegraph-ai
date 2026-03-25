# codegraph-ai

> AI-powered codebase dependency visualizer — parse any local JS/TS project and explore its file dependency graph interactively.

---

## ✨ Features

- 🔍 **Recursive file scanner** – finds all `.js`, `.ts`, `.jsx`, `.tsx` files
- 🧠 **AST parser** – uses `@babel/parser` to extract import/export relationships
- 📊 **Interactive graph** – built with [React Flow](https://reactflow.dev/) (zoom, pan, minimap)
- ⚡ **Fast** – fully async backend, concurrent file parsing

---

## 🏗️ Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite, Tailwind CSS, React Flow |
| Backend  | Node.js, Express, @babel/parser     |

---

## 📁 Project Structure

```
codegraph-ai/
├── package.json            # Root – concurrently runs client + server
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   └── GraphView.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   └── GraphPage.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
└── server/                 # Express backend
    ├── index.js
    ├── routes/
    │   └── analyze.js
    ├── controllers/
    │   └── analyzeController.js
    ├── services/
    │   ├── fileScanner.js
    │   └── astParser.js
    └── utils/
        └── logger.js
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 18** (uses `node --watch` for dev mode)
- npm ≥ 9

### Installation

```bash
# Clone the repo
git clone https://github.com/SamanPandey-in/codegraph-ai.git
cd codegraph-ai

# Install all dependencies (root + server + client)
npm install
npm --prefix server install
npm --prefix client install
```

### Environment (optional)

The server defaults to port `3001`. To override, create `server/.env`:

```env
PORT=3001
```

### Development

```bash
npm run dev
```

This starts:
- **Backend** on `http://localhost:3001`
- **Frontend** on `http://localhost:5173`

---

## 🖥️ Usage

1. Open `http://localhost:5173` in your browser
2. Enter an **absolute path** to any local JS/TS project (e.g. `/home/user/my-app`)
3. Click **Analyze Codebase**
4. Explore the interactive dependency graph!

---

## 🔌 API

### `POST /analyze`

**Request body:**
```json
{ "path": "/absolute/path/to/project" }
```

**Response:**
```json
{
  "rootDir": "/absolute/path/to/project",
  "fileCount": 12,
  "graph": {
    "src/index.js": ["src/utils.js", "src/api.js"],
    "src/utils.js": [],
    "src/api.js": ["src/utils.js"]
  }
}
```

---

## 🛣️ Roadmap

- [ ] AI-powered code explanation (GPT/Claude integration)
- [ ] Circular dependency detection & highlighting
- [ ] Support for Python, Ruby, and other languages
- [ ] Export graph as SVG/PNG

---

## 📄 License

MIT

# ⚡ React Starter Kit — Rapid Development Boilerplate

Created by **SAMAN PANDEY**

A **production-ready React starter kit** optimized for **hackathons**, **MVPs**, and **real-world projects**.  
This template eliminates setup friction and gives you authentication, theming, routing, state management, API handling, and UI tooling **out of the box**.

---

## ✨ Why This Starter Kit?

This starter kit is designed to let you **start building immediately**, not configuring.

### You get:
- ✅ Modern **React 19 + Vite**
- ✅ **Authentication system** (login/signup/protected routes)
- ✅ **Redux Toolkit + RTK Query**
- ✅ **Theme system** (Dark/Light, Tailwind + MUI synced)
- ✅ **Routing with public & protected routes**
- ✅ **Axios API layer with token refresh**
- ✅ **TailwindCSS v4 + MUI v7**
- ✅ Clean, scalable folder structure

Perfect for:
- 🚀 Hackathons
- 🧪 MVPs
- 🏗️ SaaS dashboards
- 🧠 Learning best practices

---

## 🧰 Tech Stack

| Category | Technology |
|--------|------------|
| Framework | React 19 |
| Bundler | Vite |
| Routing | React Router v7 |
| State | Redux Toolkit |
| UI | MUI v7 + TailwindCSS v4 |
| Styling | CSS Variables + Tailwind |
| Icons | Lucide React |
| API | Axios |
| Auth | JWT + Refresh Tokens |
| Linting | ESLint |

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/SamanPandey-in/React-starter-kit.git

# Install dependencies
npm install

# Start development server
npm run dev
````

---

## 🔐 Environment Variables

Create a `.env` file in the root:

```env
VITE_API_URL=http://localhost:5000/api
```

This URL is used by Axios for all API requests.

---

## 🗂️ Project Structure

```txt
src/
├── App.jsx                # App routes & providers
├── main.jsx               # React entry point
├── index.css              # Global styles + design tokens
│
├── assets/                # Static assets
│
├── components/
│   ├── layout/            # App shell (Header, Sidebar, Layout)
│   ├── theme/             # Theme provider & toggle
│   └── Logo.jsx
│
├── contexts/
│   └── AuthContext.jsx    # Authentication logic
│
├── pages/
│   ├── Landing.jsx
│   ├── Login.jsx
│   ├── Signup.jsx
│   ├── Home.jsx
│   └── index.js
│
├── services/
│   └── api.js             # Axios instance & API modules
│
├── store/
│   ├── slices/            # Redux slices
│   ├── rtkQuery/          # RTK Query examples
│   ├── docs/              # Redux configuration documentation
│   ├── store.js
│   └── index.js
│
├── styles/
│   └── muiTheme.js        # MUI theme configuration
```

---

## 🧭 Routing Architecture

### Public Routes

* `/` → Landing
* `/login`
* `/signup`

### Protected Routes

* `/home`
* (Add more inside `Layout`)

### Route Guards

* `ProtectedRoute` → requires authentication
* `PublicRoute` → redirects if already logged in

---

## 🔐 Authentication System

### Features

* JWT-based authentication
* Auto token refresh
* Persistent login (localStorage)
* Role-based helpers

### Available Auth Helpers

```js
const {
  user,
  login,
  signup,
  logout,
  isAuthenticated,
  isAdmin,
  isManager,
  isTechnician,
  isUser
} = useAuth();
```

---

## 🎨 Theming System (Dark / Light)

### Powered by:

* TailwindCSS variables
* Redux `themeSlice`
* MUI ThemeProvider
* CSS variables

### How it works

* Redux controls theme mode
* Tailwind dark mode syncs automatically
* MUI theme updates dynamically
* Theme preference saved to `localStorage`

---

## 🧠 State Management (Redux Toolkit)

### Included:

* Redux Toolkit store
* UI slice examples
* Theme slice
* RTK Query demos
* Documentation inside `/store/docs`

### Adding a new slice

```js
createSlice({
  name: 'feature',
  initialState,
  reducers: {}
})
```

---

## 🌐 API Layer

### Axios Features

* Centralized instance
* JWT auto-attach
* Refresh token handling
* Auto logout on failure

### Example API Modules

* `authAPI`
* `userAPI`
* `equipmentAPI`
* `teamAPI`
* `requestAPI`

Add new APIs inside `services/api.js`.

---

## 🧪 Pages Included

| Page    | Purpose               |
| ------- | --------------------- |
| Landing | Public marketing page |
| Login   | Authentication        |
| Signup  | Registration          |
| Home    | Protected dashboard   |

---

## 🧱 UI Components

* Responsive layout with Sidebar & Header
* MUI form components
* Tailwind utility styling
* Lucide icons

---

## 🛠 Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run preview   # Preview build
npm run lint      # Run ESLint
```

---

## 🚀 How to Use in Hackathons

1. Clone
2. Set API URL
3. Rename app
4. Build features
5. Ship fast ⚡

---

## 🧩 Customization Tips

* Replace branding in `Logo.jsx`
* Update colors in `index.css`
* Modify layout in `components/layout`
* Add routes inside `App.jsx`
* Extend Redux slices as needed

---

## 📄 License

MIT — free to use, modify, and ship.

---

## 🧠 Author

Built with ⚡ by **SAMAN PANDEY**

If this starter helped you, ⭐ the repo and build something awesome.

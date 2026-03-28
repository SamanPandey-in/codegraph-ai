import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  authService,
  AUTH_UNAUTHORIZED_EVENT,
} from '../services/authService';

const DEMO_STORAGE_KEY = 'cg_demo_user';
const DEMO_AUTH_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_AUTH !== 'false';

const DEMO_USER = {
  id: 'demo-user',
  username: 'demo',
  email: 'demo@codegraph.local',
  avatar: null,
  role: 'ADMIN',
};

const AuthContext = createContext(null);

let initialAuthRequest = null;

const fetchCurrentUser = () => {
  if (!initialAuthRequest) {
    initialAuthRequest = authService
      .getCurrentUser()
      .then((res) => res.data?.data ?? null)
      .catch(() => null);
  }
  return initialAuthRequest;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (DEMO_AUTH_ENABLED) {
        try {
          const saved = localStorage.getItem(DEMO_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            setUser(parsed);
            initialAuthRequest = Promise.resolve(parsed);
            setLoading(false);
            return;
          }
        } catch {
          localStorage.removeItem(DEMO_STORAGE_KEY);
        }
      }

      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () =>
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const loginWithGithub = (pathOrUrl) => authService.loginWithGithub(pathOrUrl);

  const loginWithDemo = () => {
    if (!DEMO_AUTH_ENABLED) return;
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(DEMO_USER));
    initialAuthRequest = Promise.resolve(DEMO_USER);
    setUser(DEMO_USER);
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error('[AuthContext] Logout error:', err);
    } finally {
      initialAuthRequest = Promise.resolve(null);
      localStorage.removeItem('user');
      localStorage.removeItem(DEMO_STORAGE_KEY);
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'ADMIN',
    demoAuthEnabled: DEMO_AUTH_ENABLED,
    demoCredentials: { username: 'demo', password: 'demo123' },
    loginWithGithub,
    loginWithDemo,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

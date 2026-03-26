import React, { createContext, useContext, useState, useEffect } from 'react';
import { AUTH_UNAUTHORIZED_EVENT, authAPI, userAPI } from '../services/api';

const AuthContext = createContext(null);
let initialAuthRequest = null;

const getInitialUser = async () => {
  if (!initialAuthRequest) {
    initialAuthRequest = userAPI
      .getCurrentUser()
      .then((response) => response.data.data ?? null)
      .catch(() => null);
  }

  return initialAuthRequest;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const currentUser = await getInitialUser();
      setUser(currentUser);
      if (!currentUser) {
        localStorage.removeItem('user');
      }
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

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const loginWithGithub = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL 
      ? `${import.meta.env.VITE_API_BASE_URL}/api`
      : 'http://localhost:5000/api';
    window.location.href = `${baseUrl}/auth/github`;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      initialAuthRequest = Promise.resolve(null);
      localStorage.removeItem('user');
      setUser(null);
    }
  };

  const value = {
    user,
    loginWithGithub,
    logout,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN',
    isUser: user?.role === 'USER',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

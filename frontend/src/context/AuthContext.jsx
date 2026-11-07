import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  const checkAuth = useCallback(async () => {
    try {
      const data = await getMe();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Register 401 callback to auto clear user state on session expiration
    setUnauthorizedHandler(() => {
      setUser((currentUser) => {
        if (currentUser) {
          setSessionExpiredMessage('Session expired, please login again');
        }
        return null;
      });
    });

    checkAuth();
  }, [checkAuth]);

  const login = async (username, password) => {
    setSessionExpiredMessage('');
    const data = await apiLogin(username, password);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {
      // ignore logout network errors
    } finally {
      setUser(null);
      setSessionExpiredMessage('');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionExpiredMessage,
        setSessionExpiredMessage,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Workspace } from '../types';
import { API_BASE_URL, autoDetectHealthyBackend } from '../config/api';

interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  token: string | null;
  isAuthenticated: boolean;
  checkConnectId: (id: string) => Promise<{ available: boolean; message: string }>;
  sendOtp: (email: string, purpose?: string) => Promise<{ success: boolean; message?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ success: boolean; message?: string }>;
  login: (identifier: string, pass?: string, otp?: string) => Promise<{ success: boolean; message?: string }>;
  signup: (name: string, connectId: string, email: string, pass: string, otp?: string) => Promise<{ success: boolean; message?: string }>;
  updateProfile: (data: { name?: string; bio?: string; status?: string; avatar?: string }) => Promise<{ success: boolean; message?: string }>;
  resetPasswordWithOtp: (email: string, otp: string, newPass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  switchWorkspace: (workspace: Workspace) => void;
}

const defaultWorkspace: Workspace = {
  id: 'ws-1',
  name: 'JM Vertex Workspace',
  slug: 'jm-vertex',
  plan: 'pilot',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('vertexUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [workspace, setWorkspace] = useState<Workspace | null>(() => {
    try {
      const saved = localStorage.getItem('vertexWorkspace');
      return saved ? JSON.parse(saved) : defaultWorkspace;
    } catch {
      return defaultWorkspace;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('vertexToken') || null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('vertexUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('vertexUser');
    }
  }, [user]);

  useEffect(() => {
    if (workspace) {
      localStorage.setItem('vertexWorkspace', JSON.stringify(workspace));
    } else {
      localStorage.removeItem('vertexWorkspace');
    }
  }, [workspace]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('vertexToken', token);
    } else {
      localStorage.removeItem('vertexToken');
    }
  }, [token]);

  // Background health-check and auto-detection of healthy backend on startup
  useEffect(() => {
    autoDetectHealthyBackend().catch(() => {});
  }, []);

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    let base = localStorage.getItem('VERTEX_API_URL') || API_BASE_URL;
    if (base.includes('trycloudflare.com') || base.includes('loca.lt')) {
      localStorage.removeItem('VERTEX_API_URL');
      base = API_BASE_URL;
    }
    try {
      const res = await fetch(`${base}${path}`, options);
      if (res.status === 502 || res.status === 503) throw new Error('Bad gateway');
      return res;
    } catch {
      // Primary failed; failover to healthy backend
      const healthy = await autoDetectHealthyBackend();
      return await fetch(`${healthy}${path}`, options);
    }
  };

  const checkConnectId = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/auth/check-connect-id?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      return { available: !!data.available, message: data.message || '' };
    } catch {
      return { available: true, message: 'ID check offline mode' };
    }
  };

  const sendOtp = async (email: string, purpose: string = 'account verification') => {
    try {
      const res = await apiFetch(`/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await res.json();
      if (res.ok) {
        return { 
          success: true, 
          message: data.message
        };
      }
      return { success: false, message: data.detail || 'Failed to send OTP' };
    } catch {
      return { success: false, message: 'Backend unreachable. Make sure backend is running.' };
    }
  };

  const verifyOtp = async (email: string, otp: string) => {
    try {
      const res = await apiFetch(`/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      return { success: false, message: data.detail || 'Invalid verification code' };
    } catch {
      return { success: false, message: 'Backend connection failed' };
    }
  };

  const login = async (identifier: string, pass?: string, otp?: string) => {
    try {
      const trimmed = identifier.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      const cleanConnectId = trimmed.replace(/^@/, '');
      const body: any = {
        identifier: trimmed,
        email: isEmail ? trimmed.toLowerCase() : undefined,
        connect_id: !isEmail ? cleanConnectId.toLowerCase() : undefined,
        password: pass,
        otp,
      };

      const res = await apiFetch(`/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setToken(data.access_token);
        return { success: true };
      }
      return { success: false, message: data.detail || 'Login failed' };
    } catch {
      return { success: false, message: 'Backend server unreachable. Reconnecting...' };
    }
  };

  const signup = async (name: string, connectId: string, email: string, pass: string, otp?: string) => {
    try {
      const res = await apiFetch(`/api/v1/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, connect_id: connectId, email, password: pass, otp }),
      });

      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setToken(data.access_token);
        return { success: true };
      }
      return { success: false, message: data.detail || 'Signup failed' };
    } catch {
      return { success: false, message: 'Backend server unreachable' };
    }
  };

  const updateProfile = async (data: { name?: string; bio?: string; status?: string; avatar?: string }) => {
    if (!user) return { success: false, message: 'Not logged in' };
    try {
      const res = await apiFetch(`/api/v1/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, ...data }),
      });
      const updated = await res.json();
      if (res.ok) {
        setUser(updated);
        return { success: true };
      }
      return { success: false, message: updated.detail || 'Update failed' };
    } catch {
      return { success: false, message: 'Backend unreachable.' };
    }
  };

  const resetPasswordWithOtp = async (email: string, otp: string, newPass: string) => {
    try {
      const res = await apiFetch(`/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, new_password: newPass }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      return { success: false, message: data.detail || 'Password reset failed' };
    } catch {
      return { success: false, message: 'Backend unreachable.' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('vertexUser');
    localStorage.removeItem('vertexToken');
  };

  const switchWorkspace = (newWorkspace: Workspace) => {
    setWorkspace(newWorkspace);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        token,
        isAuthenticated: !!token && !!user,
        checkConnectId,
        sendOtp,
        verifyOtp,
        login,
        signup,
        updateProfile,
        resetPasswordWithOtp,
        logout,
        switchWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

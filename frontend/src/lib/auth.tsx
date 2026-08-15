"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError } from "./api";
import type { AuthResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, ask the backend who we are. The session lives in httpOnly
  // cookies, so /api/me (with a silent refresh on 401) is the source of truth;
  // there is no token for JS to read. A 401 simply means "not logged in".
  useEffect(() => {
    apiFetch<User>("/api/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // The backend sets the auth cookies; the body just echoes the user.
    const res = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      refreshOn401: false,
      body: { email, password },
    });
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      displayName: string,
    ) => {
      const res = await apiFetch<AuthResponse>("/api/auth/register", {
        method: "POST",
        refreshOn401: false,
        body: { email, username, password, display_name: displayName },
      });
      setUser(res.user);
    },
    [],
  );

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiFetch<User>("/api/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
      else throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    // Best-effort server-side revocation; clear local state regardless.
    try {
      await apiFetch<void>("/api/auth/logout", {
        method: "POST",
        refreshOn401: false,
      });
    } catch {
      // ignore — we still drop the local session below
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, refreshUser, logout }),
    [user, loading, login, register, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

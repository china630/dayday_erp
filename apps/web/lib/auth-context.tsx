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
import { ACCESS_TOKEN_KEY, ORGS_KEY, USER_KEY } from "./session-keys";
import { apiFetch } from "./api-client";

export type OrgSummary = {
  id: string;
  name: string;
  taxId: string;
  currency: string;
  role: string;
};

export type AuthUser = {
  id: string;
  email: string;
  /** null — сессия без выбранной организации (создание компании на /companies). */
  role: string | null;
  organizationId: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** Глобальный супер-админ платформы. */
  isSuperAdmin?: boolean;
};

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  organizations: OrgSummary[];
  organizationId: string | null;
  login: (accessToken: string, user: AuthUser, organizations: OrgSummary[]) => void;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  /** Только для isSuperAdmin: вход от имени пользователя (поддержка). */
  impersonateAsUser: (targetUserId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);

  /** Гидратация из sessionStorage — мгновенный UI; полный список орг подтягивается ниже с сервера. */
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(ACCESS_TOKEN_KEY);
      const u = sessionStorage.getItem(USER_KEY);
      const o = sessionStorage.getItem(ORGS_KEY);
      setToken(t);
      if (u) {
        setUser(JSON.parse(u) as AuthUser);
      }
      if (o) {
        try {
          setOrganizations(JSON.parse(o) as OrgSummary[]);
        } catch {
          setOrganizations([]);
        }
      }
    } finally {
      setReady(true);
    }
  }, []);

  /**
   * Всегда синхронизируем пользователя и список организаций с `/api/auth/me`, если есть токен.
   * Раньше при наличии ORGS_KEY запрос не делался — список залипал (например, одна компания после
   * добавления второй), переключатель в шапке скрывался (length <= 1).
   */
  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    void (async () => {
      const res = await apiFetch("/api/auth/me");
      if (cancelled || !res.ok) return;
      const data = (await res.json()) as {
        user: AuthUser;
        organizations: OrgSummary[];
      };
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
      sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
      setUser(data.user);
      setOrganizations(data.organizations);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  const login = useCallback(
    (accessToken: string, u: AuthUser, orgs: OrgSummary[]) => {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      sessionStorage.setItem(USER_KEY, JSON.stringify(u));
      sessionStorage.setItem(ORGS_KEY, JSON.stringify(orgs));
      setToken(accessToken);
      setUser(u);
      setOrganizations(orgs);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ORGS_KEY);
    setToken(null);
    setUser(null);
    setOrganizations([]);
  }, []);

  const switchOrganization = useCallback(async (organizationId: string) => {
    const res = await apiFetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!res.ok) {
      throw new Error(`switch failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      accessToken: string;
      user: AuthUser;
      organizations: OrgSummary[];
    };
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    setToken(data.accessToken);
    setUser(data.user);
    setOrganizations(data.organizations);
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return;
    const data = (await res.json()) as {
      user: AuthUser;
      organizations: OrgSummary[];
    };
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    setUser(data.user);
    setOrganizations(data.organizations);
  }, []);

  const impersonateAsUser = useCallback(async (targetUserId: string) => {
    const res = await apiFetch(`/api/admin/impersonate/${targetUserId}`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`impersonate failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      accessToken: string;
      user: AuthUser;
      organizations: OrgSummary[];
    };
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    setToken(data.accessToken);
    setUser(data.user);
    setOrganizations(data.organizations);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      token,
      user,
      organizations,
      organizationId: user?.organizationId ?? null,
      login,
      logout,
      switchOrganization,
      refreshSession,
      impersonateAsUser,
    }),
    [
      ready,
      token,
      user,
      organizations,
      login,
      logout,
      switchOrganization,
      refreshSession,
      impersonateAsUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

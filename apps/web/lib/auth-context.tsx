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
import {
  ACCESS_FLAGS_KEY,
  ACCESS_TOKEN_KEY,
  ACCESS_TOKEN_COOKIE_KEY,
  ORGS_KEY,
  USER_KEY,
} from "./session-keys";
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

/** Сводные флаги доступа (сервер: GET /auth/me). */
export type SessionAccessFlags = {
  canPostAccounting: boolean;
  canViewHoldingReports: boolean;
};

const DEFAULT_ACCESS_FLAGS: SessionAccessFlags = {
  canPostAccounting: false,
  canViewHoldingReports: false,
};

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  organizations: OrgSummary[];
  organizationId: string | null;
  /** Права для UI (касса/банк/проводки, отчёты холдинга). */
  access: SessionAccessFlags;
  login: (accessToken: string, user: AuthUser, organizations: OrgSummary[]) => void;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  /** Только для isSuperAdmin: вход от имени пользователя (поддержка). */
  impersonateAsUser: (targetUserId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function setAccessTokenCookie(token: string) {
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${ACCESS_TOKEN_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
}

function clearAccessTokenCookie() {
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${ACCESS_TOKEN_COOKIE_KEY}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [access, setAccess] =
    useState<SessionAccessFlags>(DEFAULT_ACCESS_FLAGS);

  /** Гидратация из sessionStorage — мгновенный UI; полный список орг подтягивается ниже с сервера. */
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(ACCESS_TOKEN_KEY);
      const u = sessionStorage.getItem(USER_KEY);
      const o = sessionStorage.getItem(ORGS_KEY);
      const a = sessionStorage.getItem(ACCESS_FLAGS_KEY);
      setToken(t);
      if (t) {
        setAccessTokenCookie(t);
      }
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
      if (a) {
        try {
          setAccess({ ...DEFAULT_ACCESS_FLAGS, ...JSON.parse(a) });
        } catch {
          setAccess(DEFAULT_ACCESS_FLAGS);
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
        access?: SessionAccessFlags;
      };
      const flags = data.access ?? DEFAULT_ACCESS_FLAGS;
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
      sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
      sessionStorage.setItem(ACCESS_FLAGS_KEY, JSON.stringify(flags));
      setUser(data.user);
      setOrganizations(data.organizations);
      setAccess(flags);
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
      sessionStorage.removeItem(ACCESS_FLAGS_KEY);
      setToken(accessToken);
      setAccessTokenCookie(accessToken);
      setUser(u);
      setOrganizations(orgs);
      setAccess(DEFAULT_ACCESS_FLAGS);
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
    sessionStorage.removeItem(ACCESS_FLAGS_KEY);
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setAccess(DEFAULT_ACCESS_FLAGS);
    clearAccessTokenCookie();
    try {
      window.location.replace("/login");
    } catch {
      /* ignore */
    }
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
      access?: SessionAccessFlags;
    };
    const flags = data.access ?? DEFAULT_ACCESS_FLAGS;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    sessionStorage.setItem(ACCESS_FLAGS_KEY, JSON.stringify(flags));
    setToken(data.accessToken);
    setAccessTokenCookie(data.accessToken);
    setUser(data.user);
    setOrganizations(data.organizations);
    setAccess(flags);
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return;
    const data = (await res.json()) as {
      user: AuthUser;
      organizations: OrgSummary[];
      access?: SessionAccessFlags;
    };
    const flags = data.access ?? DEFAULT_ACCESS_FLAGS;
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    sessionStorage.setItem(ACCESS_FLAGS_KEY, JSON.stringify(flags));
    setUser(data.user);
    setOrganizations(data.organizations);
    setAccess(flags);
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
      access?: SessionAccessFlags;
    };
    const flags = data.access ?? DEFAULT_ACCESS_FLAGS;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    sessionStorage.setItem(ACCESS_FLAGS_KEY, JSON.stringify(flags));
    setToken(data.accessToken);
    setAccessTokenCookie(data.accessToken);
    setUser(data.user);
    setOrganizations(data.organizations);
    setAccess(flags);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      token,
      user,
      organizations,
      organizationId: user?.organizationId ?? null,
      access,
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
      access,
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

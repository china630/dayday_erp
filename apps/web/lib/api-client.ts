import { ACCESS_TOKEN_KEY, ORGS_KEY, USER_KEY } from "./session-keys";

/**
 * В браузере — относительный origin (`/api/...`), чтобы запросы шли через Next rewrites на бэкенд.
 * На сервере (RSC и т.п.) — прямой URL API.
 */
export function apiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
}

function parseApiErrorMessage(text: string): string {
  const trimmed = text.trim().slice(0, 800);
  if (!trimmed) return "";
  try {
    const j = JSON.parse(trimmed) as unknown;
    if (!j || typeof j !== "object") return trimmed;
    const o = j as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (Array.isArray(o.message) && o.message.every((x) => typeof x === "string")) {
      return o.message.join("; ");
    }
    if (typeof o.error === "string") return o.error;
    if (o.message && typeof o.message === "object" && o.message !== null) {
      const m = o.message as Record<string, unknown>;
      if (typeof m.message === "string") return m.message;
    }
  } catch {
    /* not JSON */
  }
  return trimmed;
}

async function emitApiErrorToast(res: Response): Promise<void> {
  try {
    const text = await res.clone().text();
    const message = parseApiErrorMessage(text) || `HTTP ${res.status}`;
    window.dispatchEvent(
      new CustomEvent("dayday:api-error", {
        detail: { status: res.status, message },
      }),
    );
  } catch {
    window.dispatchEvent(
      new CustomEvent("dayday:api-error", {
        detail: { status: res.status, message: `HTTP ${res.status}` },
      }),
    );
  }
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const url = path.startsWith("http") ? path : `${apiBaseUrl()}${path}`;

  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  }).then(async (res) => {
    if (res.status === 401 && typeof window !== "undefined") {
      // Token may be stale or signed with a different JWT secret.
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(ORGS_KEY);
      window.location.replace("/login");
    }
    let skipApiErrorToast = false;
    if (res.status === 403 && typeof window !== "undefined") {
      const clone = res.clone();
      try {
        const data: unknown = await clone.json();
        if (
          data &&
          typeof data === "object" &&
          "code" in data &&
          (data as { code?: string }).code === "SUBSCRIPTION_READ_ONLY"
        ) {
          skipApiErrorToast = true;
          window.dispatchEvent(
            new CustomEvent("dayday:subscription-read-only", {
              detail: data,
            }),
          );
        }
      } catch {
        /* ignore */
      }
    }
    const method = (init.method ?? "GET").toUpperCase();
    const isRead = method === "GET" || method === "HEAD";
    if (
      typeof window !== "undefined" &&
      res.status >= 400 &&
      res.status !== 401 &&
      !skipApiErrorToast &&
      !isRead
    ) {
      void emitApiErrorToast(res);
    }
    return res;
  });
}

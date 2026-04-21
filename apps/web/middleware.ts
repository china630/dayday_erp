import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DAYDAY_MAINTENANCE_HTML } from "./lib/maintenance-page-html";

const ACCESS_TOKEN_COOKIE_KEY = "dayday_access_token";

/** Bracket access: improves chance the value is read at runtime (not inlined at build) under `next start`. */
function maintenanceModeEnabled(): boolean {
  const raw = process.env["MAINTENANCE_MODE"]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isSkippableAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/register") return true;
  if (pathname === "/register-org") return true;
  if (pathname.startsWith("/verify/")) return true;
  if (pathname.startsWith("/billing/")) return true; // success/cancel pages
  if (pathname.startsWith("/portal")) return true; // guest invoice portal (PRD §4.15)
  if (pathname.startsWith("/api/")) return true; // Next rewrites & route handlers
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose pathname to RSC/layout for auth-only rendering decisions.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-dayday-pathname", pathname);

  // Allow static assets early.
  if (isSkippableAssetPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (maintenanceModeEnabled()) {
    return new NextResponse(DAYDAY_MAINTENANCE_HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "120",
      },
    });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE_KEY)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Basic JWT shape check (avoid treating garbage as a token).
  const parts = token.split(".");
  if (parts.length !== 3) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Lightweight JWT payload validation (no signature verification at the edge):
  // reject clearly expired tokens so we don't render protected UI.
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      payloadB64.length % 4 === 0
        ? payloadB64
        : payloadB64 + "=".repeat(4 - (payloadB64.length % 4));
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    const exp = typeof json.exp === "number" ? json.exp : null;
    if (exp && Date.now() >= exp * 1000) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)$).*)"],
};


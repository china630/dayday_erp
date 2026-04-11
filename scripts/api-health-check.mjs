#!/usr/bin/env node
/**
 * Проверка liveness API: канонический GET /api/health.
 * Опционально — legacy GET /health (тот же JSON), если передать --legacy.
 *
 * База URL: API_HEALTH_URL | NEXT_PUBLIC_API_URL | http://127.0.0.1:${API_PORT|4000}
 * При отсутствии переменных подхватывается корневой .env (если есть).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadRootEnv() {
  try {
    const p = resolve(process.cwd(), ".env");
    if (!existsSync(p)) return;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.replace(/\r$/, "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = v;
    }
  } catch {
    /* ignore */
  }
}

loadRootEnv();

const base = (
  process.env.API_HEALTH_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  `http://127.0.0.1:${process.env.API_PORT ?? "4000"}`
).replace(/\/$/, "");

const wantLegacy =
  process.argv.includes("--legacy") || process.env.HEALTH_CHECK_LEGACY === "1";

async function probe(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const r = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      cache: "no-store",
    });
    if (!r.ok) return { ok: false, url, status: r.status };
    const text = await r.text();
    if (!text.includes('"status"') || !text.includes("ok")) {
      return { ok: false, url, status: r.status, detail: "unexpected body" };
    }
    return { ok: true, url };
  } catch (e) {
    return { ok: false, url, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const primary = await probe(`${base}/api/health`);
  if (!primary.ok) {
    console.error(
      `[health:api] FAIL ${primary.url}`,
      primary.status ?? "",
      primary.detail ?? "",
    );
    process.exit(1);
  }
  console.log(`[health:api] OK ${primary.url}`);

  if (wantLegacy) {
    const leg = await probe(`${base}/health`);
    if (!leg.ok) {
      console.error(
        `[health:api] FAIL legacy ${leg.url}`,
        leg.status ?? "",
        leg.detail ?? "",
      );
      process.exit(1);
    }
    console.log(`[health:api] OK legacy ${leg.url}`);
  }

  process.exit(0);
}

void main();

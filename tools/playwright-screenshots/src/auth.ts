import type { BrowserContext, Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCESS_TOKEN_KEY,
  I18N_LANG_STORAGE_KEY,
  ORGS_KEY,
  USER_KEY,
  type SavedSession,
} from "./session-keys.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH_DIR = path.join(__dirname, "..", ".auth");
export const SESSION_FILE = path.join(AUTH_DIR, "session.json");
export const STORAGE_STATE_FILE = path.join(AUTH_DIR, "playwright-storage.json");

export function loadSavedSession(): SavedSession | null {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    const j = JSON.parse(raw) as SavedSession;
    if (j?.accessToken && j?.user) return j;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSessionFromPage(session: SavedSession): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

export async function savePlaywrightStorage(context: BrowserContext): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: STORAGE_STATE_FILE });
}

/**
 * Playwright storageState не сохраняет sessionStorage; токен DayDay лежит в sessionStorage —
 * восстанавливаем через addInitScript до загрузки приложения.
 */
export async function applyLocaleInitScript(
  context: BrowserContext,
  locale: "ru" | "az",
): Promise<void> {
  await context.addInitScript(
    ({ key, locale }) => {
      try {
        localStorage.setItem(key, locale);
      } catch {
        /* ignore */
      }
    },
    { key: I18N_LANG_STORAGE_KEY, locale },
  );
}

export async function applySessionInitScript(context: BrowserContext, session: SavedSession): Promise<void> {
  const accessToken = session.accessToken ?? "";
  const user = session.user ?? "";
  const orgs = session.orgs ?? "[]";
  await context.addInitScript(
    ({ k, accessToken, user, orgs }) => {
      sessionStorage.setItem(k.token, accessToken);
      sessionStorage.setItem(k.user, user);
      sessionStorage.setItem(k.orgs, orgs);
    },
    {
      k: { token: ACCESS_TOKEN_KEY, user: USER_KEY, orgs: ORGS_KEY },
      accessToken,
      user,
      orgs,
    },
  );
}

export async function readSessionFromPage(page: Page): Promise<SavedSession> {
  return await page.evaluate(
    (k) => ({
      accessToken: sessionStorage.getItem(k.token),
      user: sessionStorage.getItem(k.user),
      orgs: sessionStorage.getItem(k.orgs),
    }),
    { token: ACCESS_TOKEN_KEY, user: USER_KEY, orgs: ORGS_KEY },
  );
}

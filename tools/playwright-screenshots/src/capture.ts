/**
 * Обход страниц ERP и сохранение полностраничных PNG в корень монорепо: screens/
 *
 * Запуск: из корня репозитория (см. README в этой папке).
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyLocaleInitScript,
  applySessionInitScript,
  loadSavedSession,
  readSessionFromPage,
  savePlaywrightStorage,
  saveSessionFromPage,
  STORAGE_STATE_FILE,
} from "./auth.js";
import { pagesToScreenshot } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Корень монорепо (dayday_erp/) */
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

/** Корневой `.env`, затем локальный `tools/playwright-screenshots/.env` (перекрывает). */
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({
  path: path.join(REPO_ROOT, "tools", "playwright-screenshots", ".env"),
  override: true,
});

function getScreenshotLocale(): "ru" | "az" {
  const raw = (process.env.E2E_LOCALE ?? process.env.SCREENSHOT_LOCALE ?? "az").trim().toLowerCase();
  if (raw === "ru" || raw.startsWith("ru")) return "ru";
  if (raw === "az" || raw.startsWith("az")) return "az";
  throw new Error(`E2E_LOCALE: ожидается ru или az, получено «${raw}»`);
}

const SCREENSHOT_LOCALE = getScreenshotLocale();
const SCREENS_DIR = path.join(REPO_ROOT, "screens", SCREENSHOT_LOCALE);

const BASE_URL = (process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

const forceLogin =
  process.argv.includes("--fresh") ||
  process.argv.includes("--force-login") ||
  process.env.E2E_FORCE_LOGIN === "1" ||
  process.env.E2E_FORCE_LOGIN === "true";

/**
 * Один экран без полного прогона: `--only 03-banking-cash` или `--only /banking/cash`
 * (имя файла из `config.ts` или путь Next.js).
 * Приоритет: argv → `E2E_ONLY` / `SCREENSHOT_ONLY` (удобно, если вложенный `npm` съедает флаги).
 */
function parseOnlyArg(): string | null {
  const idx = process.argv.findIndex((a) => a === "--only" || a === "--page");
  if (idx !== -1) {
    const v = process.argv[idx + 1]?.trim();
    if (!v || v.startsWith("--")) {
      throw new Error(
        'После --only укажите имя файла из config (например 03-banking-cash) или путь (/banking/cash). Пример: npm run screenshots:erp -- --only 03-banking-cash',
      );
    }
    return v;
  }
  return process.env.E2E_ONLY?.trim() || process.env.SCREENSHOT_ONLY?.trim() || null;
}

function normalizeTaxId(s: string): string {
  return s.replace(/\D/g, "");
}

type OrgFromSession = { id: string; name: string; taxId?: string };

function resolvePagesSubset(needle: string): Array<{ path: string; fileName: string }> {
  const n = needle.trim();
  const noPng = n.replace(/\.png$/i, "");
  const byFile = pagesToScreenshot.find((p) => p.fileName === n || p.fileName === noPng);
  if (byFile) return [byFile];
  const pathNorm = n.startsWith("/") ? n : `/${n}`;
  const byPath = pagesToScreenshot.find((p) => p.path === pathNorm || p.path === n);
  if (byPath) return [byPath];
  throw new Error(
    `Не найдено в src/config.ts (pagesToScreenshot): «${needle}». Доступные fileName: ${pagesToScreenshot.map((p) => p.fileName).join(", ")}`,
  );
}

/** JWT access token (Nest): проверка exp, чтобы не использовать протухший session.json без --fresh */
function isAccessTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 <= Date.now() + 30_000;
  } catch {
    return false;
  }
}

function resolveE2eEmail(): string | undefined {
  return (
    process.env.E2E_EMAIL?.trim() ||
    process.env.PLAYWRIGHT_EMAIL?.trim() ||
    process.env.SCREENSHOT_EMAIL?.trim()
  );
}

function resolveE2ePassword(): string | undefined {
  return (
    process.env.E2E_PASSWORD?.trim() ||
    process.env.PLAYWRIGHT_PASSWORD?.trim() ||
    process.env.SCREENSHOT_PASSWORD?.trim()
  );
}

function requireE2eCredentials(): { email: string; password: string } {
  const email = resolveE2eEmail();
  const password = resolveE2ePassword();
  if (!email || !password) {
    throw new Error(
      "Задайте логин и пароль для скриншотов: E2E_EMAIL и E2E_PASSWORD в корневом .env " +
        "(или tools/playwright-screenshots/.env). Допустимые синонимы: PLAYWRIGHT_EMAIL / PLAYWRIGHT_PASSWORD, SCREENSHOT_EMAIL / SCREENSHOT_PASSWORD.",
    );
  }
  return { email, password };
}

function loadUsableSavedSession(): ReturnType<typeof loadSavedSession> {
  const s = loadSavedSession();
  if (!s?.accessToken) return null;
  if (isAccessTokenExpired(s.accessToken)) {
    console.warn(
      "[screenshots] session.json с истёкшим JWT — выполняется новый вход. Для явного контроля: npm run capture -- --fresh",
    );
    return null;
  }
  return s;
}

async function resolveTargetOrgName(page: Page): Promise<string | null> {
  const idOrVoen = process.env.E2E_ORG_ID?.trim();
  if (idOrVoen) {
    const orgsJson = await page.evaluate(() => sessionStorage.getItem("dayday_organizations"));
    try {
      const orgs = JSON.parse(orgsJson || "[]") as OrgFromSession[];
      const byUuid = orgs.find((x) => x.id === idOrVoen);
      if (byUuid) return byUuid.name;
      const want = normalizeTaxId(idOrVoen);
      if (want.length > 0) {
        const byTax = orgs.find(
          (x) => x.taxId && (normalizeTaxId(x.taxId) === want || x.taxId === idOrVoen),
        );
        if (byTax) return byTax.name;
      }
    } catch {
      /* ignore */
    }
    console.warn(
      `[screenshots] E2E_ORG_ID=${idOrVoen} не найден (ни uuid, ни VÖEN/taxId в списке) — используйте E2E_ORG_NAME или проверьте значение`,
    );
  }
  const n = process.env.E2E_ORG_NAME?.trim();
  return n || null;
}

/** Страница выбора компаний после логина (несколько организаций). */
async function openCompanyFromCompaniesPage(page: Page, matchName: string | null): Promise<void> {
  await page.waitForLoadState("networkidle");
  const listItems = page.locator("section").first().locator("ul li");
  await listItems.first().waitFor({ state: "visible", timeout: 60000 }).catch(() => undefined);
  if (matchName) {
    await page.locator("li").filter({ hasText: matchName }).first().getByRole("button").click();
  } else {
    await listItems.first().getByRole("button").click();
  }
  await page.waitForURL((u) => !u.pathname.includes("/companies"), { timeout: 120000 });
}

/** Переключатель организаций в шапке (несколько компаний, уже внутри приложения). */
async function switchOrgInShellIfNeeded(page: Page, matchName: string | null): Promise<void> {
  if (!matchName) return;
  await page.waitForLoadState("networkidle");
  let orgs: Array<{ id: string; name: string }> = [];
  try {
    const orgsJson = await page.evaluate(() => sessionStorage.getItem("dayday_organizations"));
    orgs = JSON.parse(orgsJson || "[]");
  } catch {
    return;
  }
  if (orgs.length <= 1) return;

  let user: { organizationId?: string | null } = {};
  try {
    const userJson = await page.evaluate(() => sessionStorage.getItem("dayday_user"));
    user = JSON.parse(userJson || "{}");
  } catch {
    return;
  }

  const target = orgs.find((o) => o.name.includes(matchName));
  if (!target || target.id === user.organizationId) return;

  const switcher = page.locator('button[aria-haspopup="listbox"]').first();
  await switcher.waitFor({ state: "visible", timeout: 15000 });
  await switcher.click();
  await page
    .locator('[role="listbox"]')
    .getByRole("button")
    .filter({ hasText: matchName })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
}

async function performLogin(context: BrowserContext, page: Page): Promise<void> {
  const { email, password } = requireE2eCredentials();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 120000 });
  await page.waitForLoadState("networkidle");

  const targetOrgName = await resolveTargetOrgName(page);

  if (page.url().includes("/companies")) {
    await openCompanyFromCompaniesPage(page, targetOrgName);
    await page.waitForLoadState("networkidle");
  }

  await switchOrgInShellIfNeeded(page, targetOrgName);

  const session = await readSessionFromPage(page);
  saveSessionFromPage(session);
  await savePlaywrightStorage(context);
  console.log("[screenshots] Сессия сохранена: tools/playwright-screenshots/.auth/session.json + playwright-storage.json");
}

/**
 * Дожидаемся «тишины» сети и исчезновения типичных индикаторов загрузки.
 */
async function waitForStableUi(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");

  /** Типовые подписи загрузки (az/ru/en), если нет спиннера в DOM */
  const loadingPhrases = ["Yüklənir", "Загрузка", "Loading", "Yüklənir..."];
  for (const phrase of loadingPhrases) {
    const loc = page.getByText(phrase, { exact: false }).first();
    if ((await loc.count()) > 0) {
      await loc.waitFor({ state: "hidden", timeout: 120000 }).catch(() => undefined);
      break;
    }
  }

  const loaderSelectors = [
    ".animate-spin",
    "[role=\"progressbar\"]",
    "[class*=\"skeleton\"]",
    "[data-loading=\"true\"]",
  ];

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const busy = await page.evaluate((sels: string[]) => {
      return sels.some((sel) => {
        try {
          return document.querySelector(sel) !== null;
        } catch {
          return false;
        }
      });
    }, loaderSelectors);

    if (!busy) {
      await page.waitForTimeout(400);
      const busy2 = await page.evaluate((sels: string[]) => {
        return sels.some((sel) => {
          try {
            return document.querySelector(sel) !== null;
          } catch {
            return false;
          }
        });
      }, loaderSelectors);
      if (!busy2) return;
    }
    await page.waitForTimeout(500);
  }

  throw new Error("Таймаут ожидания исчезновения индикаторов загрузки");
}

async function runScreenshotLoop(
  context: BrowserContext,
  entries: Array<{ path: string; fileName: string }>,
): Promise<void> {
  for (const entry of entries) {
    const url = `${BASE_URL}${entry.path.startsWith("/") ? entry.path : `/${entry.path}`}`;
    const outPath = path.join(SCREENS_DIR, `${entry.fileName}.png`);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      if (page.url().includes("/login")) {
        throw new Error("Редирект на /login — сессия истекла. Запустите с --fresh");
      }
      await waitForStableUi(page);
      await page.screenshot({ path: outPath, fullPage: true, type: "png" });
      console.log(`[ok] ${entry.fileName} ← ${entry.path}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[skip] ${entry.fileName} (${entry.path}): ${msg}`);
    } finally {
      await page.close();
    }
  }
}

async function createAuthenticatedContext(browser: import("playwright").Browser): Promise<BrowserContext> {
  const saved = forceLogin ? null : loadUsableSavedSession();

  if (saved) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState: fs.existsSync(STORAGE_STATE_FILE) ? STORAGE_STATE_FILE : undefined,
    });
    await applyLocaleInitScript(context, SCREENSHOT_LOCALE);
    await applySessionInitScript(context, saved);
    return context;
  }

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await applyLocaleInitScript(context, SCREENSHOT_LOCALE);
  return context;
}

async function main(): Promise<void> {
  const usable = loadUsableSavedSession();
  if (forceLogin || !usable) {
    requireE2eCredentials();
  }

  const only = parseOnlyArg();
  const pagesToRun = only ? resolvePagesSubset(only) : pagesToScreenshot;

  console.log(
    `[screenshots] Локаль UI: ${SCREENSHOT_LOCALE} → ${path.relative(REPO_ROOT, SCREENS_DIR)}` +
      (only ? ` (только: ${pagesToRun.map((p) => p.fileName).join(", ")})` : ""),
  );

  fs.mkdirSync(SCREENS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let context = await createAuthenticatedContext(browser);
  let page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });

  /** Главная без токена не редиректит на /login — проверяем sessionStorage. */
  const hasToken = await page.evaluate(() => Boolean(sessionStorage.getItem("dayday_access_token")));

  if (page.url().includes("/login") || !hasToken) {
    await page.close();
    await context.close();
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await applyLocaleInitScript(context, SCREENSHOT_LOCALE);
    page = await context.newPage();
    await performLogin(context, page);
    await page.close();
  } else {
    const targetOrgName = await resolveTargetOrgName(page);
    await switchOrgInShellIfNeeded(page, targetOrgName);
    await page.close();
  }

  await runScreenshotLoop(context, pagesToRun);
  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

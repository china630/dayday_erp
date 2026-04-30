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
import { pagesToScreenshot, type ScreenshotPage } from "./config.js";

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
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.E2E_API_URL ??
  BASE_URL.replace(":3000", ":4000").replace("localhost:3000", "127.0.0.1:4000")
).replace(/\/$/, "");

const forceLogin =
  process.argv.includes("--fresh") ||
  process.argv.includes("--force-login") ||
  process.env.E2E_FORCE_LOGIN === "1" ||
  process.env.E2E_FORCE_LOGIN === "true";

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return undefined;
  const raw = process.argv[idx + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error(`После ${flag} укажите значение`);
  }
  return raw.trim();
}

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
  const byArg = getArgValue("--email");
  if (byArg) return byArg;
  return (
    process.env.E2E_EMAIL?.trim() ||
    process.env.PLAYWRIGHT_EMAIL?.trim() ||
    process.env.SCREENSHOT_EMAIL?.trim()
  );
}

function resolveE2ePassword(): string | undefined {
  const byArg = getArgValue("--password");
  if (byArg) return byArg;
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
  const idOrVoen = getArgValue("--org-id") || process.env.E2E_ORG_ID?.trim();
  if (idOrVoen) {
    let orgsJson: string | null = null;
    try {
      orgsJson = await page.evaluate(() => sessionStorage.getItem("dayday_organizations"));
    } catch {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      orgsJson = await page.evaluate(() => sessionStorage.getItem("dayday_organizations")).catch(() => "[]");
    }
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
  const n = getArgValue("--org-name") || process.env.E2E_ORG_NAME?.trim();
  return n || null;
}

function resolveCliModalOptions():
  | {
      modalOpenSelector?: string;
      modalVisibleSelector?: string;
    }
  | null {
  const modalOpenSelector = getArgValue("--modal-open");
  const modalVisibleSelector = getArgValue("--modal-wait");
  if (!modalOpenSelector && !modalVisibleSelector) return null;
  return { modalOpenSelector, modalVisibleSelector };
}

function resolveModalPreset(entry: ScreenshotPage):
  | { modalOpenSelector?: string; modalVisibleSelector?: string }
  | null {
  const slug = entry.sourceSlug?.trim().toLowerCase();
  if (!slug || !slug.startsWith("modal/")) return null;

  const map: Record<string, { modalOpenSelector?: string; modalVisibleSelector?: string }> = {
    "modal/create-counterparty": {
      modalOpenSelector:
        'button:has-text("Counterparty"),button:has-text("Контрагент"),button:has-text("Kontragent"),button:has-text("Yeni"),button:has-text("Созд"),a[href="/counterparties/new"]',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/create-invoice": {
      modalOpenSelector:
        'button:has-text("Invoice"),button:has-text("Инвойс"),button:has-text("İnvoys"),button:has-text("Созд"),button:has-text("Yeni"),a[href="/invoices/new"]',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/employee": {
      modalOpenSelector: 'button:has-text("Employee"),button:has-text("Сотрудник"),a[href="/employees/new"]',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/department": {
      modalOpenSelector: 'button:has-text("Department"),button:has-text("Отдел"),button:has-text("Şöbə")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/job-position": {
      modalOpenSelector: 'button:has-text("Position"),button:has-text("Должность"),button:has-text("Vəzifə")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/absence": {
      modalOpenSelector: 'button:has-text("Absence"),button:has-text("Отсутств"),button:has-text("Məzuniyyət")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/vacation-calc": {
      modalOpenSelector: 'button:has-text("Vacation"),button:has-text("Отпуск"),button:has-text("Məzuniyyət hesabla")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/sick-calc": {
      modalOpenSelector: 'button:has-text("Sick"),button:has-text("Больнич"),button:has-text("Xəstəlik")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/employee-absences": {
      modalOpenSelector: 'button:has-text("Absences"),button:has-text("Отсутствия"),button:has-text("İşçi məzuniyyətləri")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/payroll-run": {
      modalOpenSelector: 'button:has-text("Payroll"),button:has-text("Зарплата"),button:has-text("Bordro")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/product": {
      modalOpenSelector: 'button:has-text("Product"),button:has-text("Товар"),a[href="/products/new"]',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/create-company": {
      modalOpenSelector: 'button:has-text("Company"),button:has-text("Компания"),button:has-text("Şirkət")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/create-holding": {
      modalOpenSelector: 'button:has-text("Holding"),button:has-text("Холдинг")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/voen-request": {
      modalOpenSelector: 'button:has-text("VÖEN"),button:has-text("VOEN"),button:has-text("ИНН")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-purchase": {
      modalOpenSelector: 'button:has-text("Purchase"),button:has-text("Приход"),button:has-text("Alış")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-write-off": {
      modalOpenSelector: 'button:has-text("Write"),button:has-text("Спис"),button:has-text("Silinmə")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-surplus": {
      modalOpenSelector: 'button:has-text("Surplus"),button:has-text("Излиш"),button:has-text("Artıq")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-adjustments": {
      modalOpenSelector: 'button:has-text("Adjust"),button:has-text("Коррект"),button:has-text("Düzəliş")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-transfer": {
      modalOpenSelector: 'button:has-text("Transfer"),button:has-text("Перемещ"),button:has-text("Köçürmə")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-audit": {
      modalOpenSelector: 'button:has-text("Audit"),button:has-text("Инвентар"),button:has-text("Inventarizasiya")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-audit-history": {
      modalOpenSelector: 'button:has-text("History"),button:has-text("История"),button:has-text("Tarixçə")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/inventory-audit-detail-confirm": {
      modalOpenSelector: 'button:has-text("Confirm"),button:has-text("Подтверд"),button:has-text("Təsdiq")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/new-warehouse": {
      modalOpenSelector: 'button:has-text("Warehouse"),button:has-text("Склад"),button:has-text("Anbar")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/audit-diff": {
      modalOpenSelector: 'button:has-text("Diff"),button:has-text("Сравн"),button:has-text("Fərq")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/payment-confirmation": {
      modalOpenSelector: 'button:has-text("Pay"),button:has-text("Оплат"),button:has-text("Ödəniş")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
    "modal/upgrade-required": {
      modalOpenSelector: 'button:has-text("Upgrade"),button:has-text("Апгрейд"),button:has-text("Yenilə")',
      modalVisibleSelector: '[role="dialog"],.fixed.inset-0.z-50',
    },
  };

  return map[slug] ?? null;
}

function formatNavigationFailure(url: string, err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED|net::ERR_CONNECTION/i.test(raw)) {
    return new Error(
      `[screenshots] Сервер не отвечает по адресу ${url} (${raw}). ` +
        `Поднимите фронт: из корня монорепо выполните «npm run dev:web» или «npm run dev» (по умолчанию http://127.0.0.1:3000). ` +
        `При другом хосте задайте E2E_BASE_URL или BASE_URL в .env.`,
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) {
        await page.waitForTimeout(1500);
        continue;
      }
    }
  }
  throw formatNavigationFailure(url, lastErr);
}

async function resolveDynamicPathIfNeeded(page: Page, entry: ScreenshotPage, url: string): Promise<string> {
  if (!entry.path.includes("[id]")) return url;
  if (entry.path.includes("/counterparties/[id]/edit")) {
    await gotoWithRetry(page, `${BASE_URL}/counterparties`);
    const href =
      (await page.locator('a[href^="/counterparties/"][href$="/edit"]').first().getAttribute("href")) || null;
    if (href) return `${BASE_URL}${href}`;
  }
  return url;
}

/** Страница выбора компаний после логина (несколько организаций). */
async function openCompanyFromCompaniesPage(page: Page, matchName: string | null): Promise<void> {
  await page.waitForLoadState("networkidle");
  const listItems = page.locator("section").first().locator("ul li");
  await listItems.first().waitFor({ state: "visible", timeout: 60000 }).catch(() => undefined);

  if (matchName) {
    const namedButton = page.getByRole("button", { name: new RegExp(matchName, "i") }).first();
    if ((await namedButton.count()) > 0) {
      await namedButton.click();
      await page.waitForURL((u) => !u.pathname.includes("/companies"), { timeout: 120000 });
      return;
    }

    const namedItemButton = page
      .locator("li")
      .filter({ hasText: matchName })
      .first()
      .getByRole("button", { name: /(Aç|Open|Открыть)/i })
      .first();
    if ((await namedItemButton.count()) > 0) {
      await namedItemButton.click();
      await page.waitForURL((u) => !u.pathname.includes("/companies"), { timeout: 120000 });
      return;
    }
  }

  const fallbacks = [
    page.locator("section ul li button").first(),
    page.locator("ul li button").first(),
    page.locator("main button").first(),
    page.getByRole("button").first(),
  ];
  let clicked = false;
  for (const candidate of fallbacks) {
    if ((await candidate.count()) > 0) {
      await candidate.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    throw new Error("[screenshots] Не удалось найти кнопку выбора организации на /companies");
  }
  try {
    await page.waitForURL((u) => !u.pathname.includes("/companies"), { timeout: 30000 });
  } catch {
    // Some builds keep user on /companies despite successful click.
    // Try to continue into app shell directly.
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => !u.pathname.includes("/companies"), { timeout: 120000 });
  }
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

  let lastErr = "unknown login error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await gotoWithRetry(page, `${BASE_URL}/login`);
      const emailInput = page.locator('input[type="email"]').first();
      const emailVisible = await emailInput.isVisible().catch(() => false);
      if (!emailVisible) {
        throw new Error("login form is not visible");
      }
      await emailInput.fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('button[type="submit"]').click();

      const loginResult = await Promise.race([
        page
          .waitForFunction(
            () =>
              !window.location.pathname.endsWith("/login") ||
              Boolean(sessionStorage.getItem("dayday_access_token")),
            undefined,
            { timeout: 30000 },
          )
          .then(() => "ok" as const),
        page
          .locator(".text-red-600")
          .first()
          .waitFor({ state: "visible", timeout: 30000 })
          .then(() => "error" as const)
          .catch(() => "timeout" as const),
      ]);

      if (loginResult === "ok") {
        break;
      }

      lastErr =
        (await page.locator(".text-red-600").first().innerText().catch(() => "")) || "unknown login error";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    if (attempt < 3) {
      const backoffMs = 1200 * attempt;
      console.warn(
        `[screenshots] Login attempt ${attempt}/3 failed for ${email}: ${lastErr}. Retry in ${backoffMs}ms...`,
      );
      await page.waitForTimeout(backoffMs);
      continue;
    }

    console.warn(
      `[screenshots] UI login failed for ${email}: ${lastErr}. Try API login fallback (${API_URL}/api/auth/login)`,
    );
    const apiRes = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    if (!apiRes || !apiRes.ok) {
      const body = apiRes ? await apiRes.text().catch(() => "") : "";
      throw new Error(
        `[screenshots] Login failed for ${email}: ${lastErr}. API fallback failed: ${apiRes?.status ?? "no-response"} ${body}`,
      );
    }
    const apiData = (await apiRes.json()) as {
      accessToken: string;
      user: Record<string, unknown>;
      organizations?: unknown[];
    };
    const session = {
      accessToken: apiData.accessToken,
      user: JSON.stringify(apiData.user ?? {}),
      orgs: JSON.stringify(apiData.organizations ?? []),
    };
    await applySessionInitScript(context, session);
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    saveSessionFromPage(session);
    await savePlaywrightStorage(context);
    console.log("[screenshots] API login fallback succeeded");
    return;
  }
  await page.waitForLoadState("domcontentloaded");

  const targetOrgName = await resolveTargetOrgName(page);

  if (page.url().includes("/companies")) {
    await openCompanyFromCompaniesPage(page, targetOrgName);
    await page.waitForLoadState("networkidle");
  }

  await switchOrgInShellIfNeeded(page, targetOrgName);

  const session = await readSessionFromPage(page);
  // sessionStorage is tab-scoped; propagate auth payload to every new page in this context.
  await applySessionInitScript(context, session);
  saveSessionFromPage(session);
  await savePlaywrightStorage(context);
  console.log("[screenshots] Сессия сохранена: tools/playwright-screenshots/.auth/session.json + playwright-storage.json");
}

async function waitPublicAuthI18n(page: Page, entryPath: string): Promise<boolean> {
  if (!["/login", "/register", "/register-org"].includes(entryPath)) return true;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const hasRawAuthKeys = await page
      .locator("text=/auth\\.[a-z0-9_.-]+/i")
      .first()
      .isVisible()
      .catch(() => false);
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    if (!hasRawAuthKeys && h1.trim() && !/^auth\./i.test(h1.trim())) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function applyAuthI18nFallback(page: Page): Promise<void> {
  const fallbackByLocale: Record<string, Record<string, string>> = {
    az: {
      "auth.registerOrgLink": "Qeydiyyatdan keçin",
      "auth.registerUserLink": "Yalnız hesab (e-poçt və ad/soyad)",
      "auth.haveAccount": "Artıq hesabınız var? Giriş",
      "auth.needAccount": "Hesab yoxdur? Qeydiyyat",
    },
    ru: {
      "auth.registerOrgLink": "Регистрация с компанией и VÖEN",
      "auth.registerUserLink": "Только аккаунт (email и ФИО)",
      "auth.haveAccount": "Уже есть аккаунт? Войти",
      "auth.needAccount": "Нет аккаунта? Регистрация",
    },
  };
  const dict = fallbackByLocale[SCREENSHOT_LOCALE] ?? fallbackByLocale.ru;
  await page.evaluate((map) => {
    const all = Array.from(document.querySelectorAll("*"));
    for (const el of all) {
      const txt = (el.textContent || "").trim();
      const repl = (map as Record<string, string>)[txt];
      if (!repl) continue;
      if (el.children.length === 0) {
        el.textContent = repl;
      }
    }
  }, dict);
}

/**
 * Дожидаемся «тишины» сети и исчезновения типичных индикаторов загрузки.
 */
async function waitForStableUi(page: Page, maxWaitMs = 15000): Promise<boolean> {
  await page.waitForLoadState("domcontentloaded");

  /** Типовые подписи загрузки (az/ru/en), если нет спиннера в DOM */
  const loadingPhrases = ["Yüklənir", "Загрузка", "Loading", "Yüklənir..."];
  for (const phrase of loadingPhrases) {
    const loc = page.getByText(phrase, { exact: false }).first();
    if ((await loc.count()) > 0) {
      await loc.waitFor({ state: "hidden", timeout: 120000 }).catch(() => undefined);
      break;
    }
  }

  const loaderSelectors = ['[role="progressbar"]', '[class*="skeleton"]', '[data-loading="true"]'];

  const deadline = Date.now() + maxWaitMs;
  let stableTicks = 0;
  while (Date.now() < deadline) {
    let busy = false;
    for (const sel of loaderSelectors) {
      const visibleCount = await page.locator(`${sel}:visible`).count().catch(() => 0);
      if (visibleCount > 0) {
        busy = true;
        break;
      }
    }

    if (!busy) {
      await page.waitForTimeout(600);
      let busy2 = false;
      for (const sel of loaderSelectors) {
        const visibleCount = await page.locator(`${sel}:visible`).count().catch(() => 0);
        if (visibleCount > 0) {
          busy2 = true;
          break;
        }
      }
      if (!busy2) {
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        const unresolvedI18nKeys =
          (text.replace(/\s+/g, " ").match(/\b[a-z][a-z0-9_-]*\.[a-z0-9_.-]{2,}\b/gi) || []).length;
        if (unresolvedI18nKeys <= 2) {
          stableTicks += 1;
          if (stableTicks >= 2) return true;
        } else {
          stableTicks = 0;
        }
      } else {
        stableTicks = 0;
      }
    }
    await page.waitForTimeout(500);
  }

  return false;
}

async function refreshSessionInContext(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  try {
    await performLogin(context, page);
  } finally {
    await page.close();
  }
}

async function applyModalCapture(page: Page, entry: ScreenshotPage): Promise<void> {
  const cliModal = resolveCliModalOptions();
  const preset = resolveModalPreset(entry);
  const openSelector = cliModal?.modalOpenSelector || entry.modalOpenSelector || preset?.modalOpenSelector;
  const visibleSelector =
    cliModal?.modalVisibleSelector || entry.modalVisibleSelector || preset?.modalVisibleSelector;
  if (!openSelector && !visibleSelector) return;

  const dialogVisible = (await page.locator('[role="dialog"], .fixed.inset-0.z-50').count().catch(() => 0)) > 0;
  if (openSelector) {
    if (!dialogVisible) {
      const selectors = openSelector
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      let clicked = false;
      for (const sel of selectors) {
        const openLoc = page.locator(sel).first();
        if ((await openLoc.count().catch(() => 0)) > 0 && (await openLoc.isVisible().catch(() => false))) {
          await openLoc.click().catch(() => undefined);
          clicked = true;
          break;
        }
      }
      if (!clicked && entry.sourceSlug === "modal/create-counterparty") {
        const btns = page.locator("button");
        const total = await btns.count().catch(() => 0);
        for (let i = 0; i < Math.min(total, 40); i++) {
          const b = btns.nth(i);
          if (!(await b.isVisible().catch(() => false))) continue;
          const txt = ((await b.innerText().catch(() => "")) || "").trim().toLowerCase();
          if (!txt) continue;
          if (/(counterparty|контраг|kontragent|m[üu]ştəri|musteri)/i.test(txt) || txt.startsWith("+")) {
            await b.click().catch(() => undefined);
            clicked = true;
            break;
          }
        }
      }
      if (!clicked && entry.sourceSlug === "modal/create-invoice") {
        const btns = page.locator("button");
        const total = await btns.count().catch(() => 0);
        for (let i = 0; i < Math.min(total, 40); i++) {
          const b = btns.nth(i);
          if (!(await b.isVisible().catch(() => false))) continue;
          const txt = ((await b.innerText().catch(() => "")) || "").trim().toLowerCase();
          if (!txt) continue;
          if (/(invoice|инвойс|invoys|faktura|hesab-faktura)/i.test(txt) || txt.startsWith("+")) {
            await b.click().catch(() => undefined);
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) {
        console.warn(
          `[screenshots] warn ${entry.fileName}: modal trigger not found (${openSelector}) | url=${page.url()} — capture page without modal`,
        );
        return;
      }
    }
  }
  if (visibleSelector) {
    try {
      await page.locator(visibleSelector).first().waitFor({ state: "visible", timeout: 30000 });
    } catch {
      console.warn(
        `[screenshots] warn ${entry.fileName}: modal not visible (${visibleSelector}) | url=${page.url()} — capture page without modal`,
      );
      return;
    }
  }
  await page.waitForTimeout(300);
}

async function ensureAdminMenuExpanded(page: Page, entry: ScreenshotPage): Promise<void> {
  if (!entry.path.startsWith("/admin/")) return;

  const targetLink = page.locator(`a[href="${entry.path}"]`).first();
  if ((await targetLink.count()) > 0 && (await targetLink.isVisible().catch(() => false))) return;

  const toggles = [
    page.getByRole("button", { name: /(admin|админ|idarə|idarəetmə)/i }).first(),
    page.locator('[aria-expanded="false"]').filter({ hasText: /(admin|админ|idarə|idarəetmə)/i }).first(),
    page.locator("button").filter({ hasText: /(admin|админ|idarə|idarəetmə)/i }).first(),
  ];

  for (const t of toggles) {
    if ((await t.count()) > 0 && (await t.isVisible().catch(() => false))) {
      await t.click().catch(() => undefined);
      await page.waitForTimeout(250);
      if ((await targetLink.count()) > 0 && (await targetLink.isVisible().catch(() => false))) return;
    }
  }
}

async function runScreenshotLoop(
  context: BrowserContext,
  entries: ScreenshotPage[],
): Promise<void> {
  for (const entry of entries) {
    const url = `${BASE_URL}${entry.path.startsWith("/") ? entry.path : `/${entry.path}`}`;
    const outPath = path.join(SCREENS_DIR, `${entry.fileName}.png`);

    const page = await context.newPage();
    try {
      const finalUrl = await resolveDynamicPathIfNeeded(page, entry, url);
      await gotoWithRetry(page, finalUrl);
      if (page.url().includes("/companies")) {
        const targetOrgName = await resolveTargetOrgName(page);
        await openCompanyFromCompaniesPage(page, targetOrgName);
        await gotoWithRetry(page, finalUrl);
      }
      if (page.url().includes("/login")) {
        await refreshSessionInContext(context);
        await gotoWithRetry(page, finalUrl);
      }
      if (page.url().includes("/login")) {
        await page.close();
        await refreshSessionInContext(context);
        const retryPage = await context.newPage();
        try {
          await gotoWithRetry(retryPage, finalUrl);
          if (retryPage.url().includes("/companies")) {
            const targetOrgName = await resolveTargetOrgName(retryPage);
            await openCompanyFromCompaniesPage(retryPage, targetOrgName);
            await gotoWithRetry(retryPage, finalUrl);
          }
          if (retryPage.url().includes("/login")) {
            throw new Error("Редирект на /login после перелогина");
          }
          const stable = await waitForStableUi(retryPage);
          if (!stable) {
            console.warn(`[screenshots] warn ${entry.fileName}: UI still loading, captured current state`);
          }
          if (retryPage.url().includes("/login")) {
            await refreshSessionInContext(context);
            await gotoWithRetry(retryPage, finalUrl);
          }
          await ensureAdminMenuExpanded(retryPage, entry);
          await applyModalCapture(retryPage, entry);
          await retryPage.screenshot({ path: outPath, fullPage: true, type: "png" });
          console.log(`[ok] ${entry.fileName} ← ${entry.path} (relogin)`);
          continue;
        } finally {
          await retryPage.close();
        }
      }
      const stable = await waitForStableUi(page);
      if (!stable) {
        console.warn(`[screenshots] warn ${entry.fileName}: UI still loading, captured current state`);
      }
      if (page.url().includes("/login")) {
        await refreshSessionInContext(context);
        await gotoWithRetry(page, finalUrl);
      }
      await ensureAdminMenuExpanded(page, entry);
      await applyModalCapture(page, entry);
      await page.screenshot({ path: outPath, fullPage: true, type: "png" });
      console.log(`[ok] ${entry.fileName} ← ${entry.path}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[skip] ${entry.fileName} (${entry.path}): ${msg}`);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}

async function runPublicScreenshotLoop(
  browser: import("playwright").Browser,
  entries: ScreenshotPage[],
): Promise<void> {
  if (entries.length === 0) return;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await applyLocaleInitScript(context, SCREENSHOT_LOCALE);
  for (const entry of entries) {
    const url = `${BASE_URL}${entry.path.startsWith("/") ? entry.path : `/${entry.path}`}`;
    const outPath = path.join(SCREENS_DIR, `${entry.fileName}.png`);
    const page = await context.newPage();
    try {
      await gotoWithRetry(page, url);
      const stable = await waitForStableUi(page, 6000);
      if (!stable) {
        console.warn(`[screenshots] warn ${entry.fileName}: public page still loading, captured current state`);
      }
      const i18nReady = await waitPublicAuthI18n(page, entry.path);
      if (!i18nReady) {
        await applyAuthI18nFallback(page);
        console.warn(`[screenshots] warn ${entry.fileName}: auth i18n fallback applied`);
      }
      await applyModalCapture(page, entry);
      await page.screenshot({ path: outPath, fullPage: true, type: "png" });
      console.log(`[ok] ${entry.fileName} ← ${entry.path}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[skip] ${entry.fileName} (${entry.path}): ${msg}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
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
  const only = parseOnlyArg();
  const pagesToRun = only ? resolvePagesSubset(only) : pagesToScreenshot;
  const publicPages = pagesToRun.filter((p) => p.requiresAuth === false);
  const authPages = pagesToRun.filter((p) => p.requiresAuth !== false);
  if (authPages.length > 0 && (forceLogin || !usable)) {
    requireE2eCredentials();
  }

  console.log(
    `[screenshots] Локаль UI: ${SCREENSHOT_LOCALE} → ${path.relative(REPO_ROOT, SCREENS_DIR)}` +
      (only ? ` (только: ${pagesToRun.map((p) => p.fileName).join(", ")})` : ""),
  );
  const emailHint = resolveE2eEmail();
  if (emailHint) {
    console.log(`[screenshots] Аккаунт: ${emailHint}`);
  }

  fs.mkdirSync(SCREENS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  await runPublicScreenshotLoop(browser, publicPages);
  if (authPages.length === 0) {
    await browser.close();
    return;
  }
  let context = await createAuthenticatedContext(browser);
  let page = await context.newPage();

  // In Next.js dev mode HMR keeps background network activity alive,
  // so networkidle can timeout forever on the entry page.
  await gotoWithRetry(page, `${BASE_URL}/`);

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

  await runScreenshotLoop(context, authPages);
  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

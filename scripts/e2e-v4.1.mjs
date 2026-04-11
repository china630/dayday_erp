#!/usr/bin/env node
/**
 * Сквозной сценарий V4.1: регистрация (trial), VÖEN → контрагент, READ_ONLY, mock-оплата.
 *
 * Требования: запущен API (по умолчанию http://127.0.0.1:4000), доступна БД из .env.
 * Для стабильного VÖEN: в .env API — TAX_LOOKUP_MOCK=1 (см. .env.example).
 * Строгий FAIL по «плохому» name шага 2: E2E_STRICT_VOEN=1 (по умолчанию — WARNING и продолжение).
 *
 *   dotenv -e .env -- node ./scripts/e2e-v4.1.mjs
 *   E2E_API_URL=http://127.0.0.1:4000 dotenv -e .env -- node ./scripts/e2e-v4.1.mjs
 */

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@dayday/database");

const BASE = process.env.E2E_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

const log = {
  ok(step, detail) {
    console.log(`SUCCESS [${step}] ${detail}`);
  },
  fail(step, reason) {
    console.error(`ERROR [${step}] ${reason}`);
  },
};

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json, text };
}

function signOrderToken(orderId, secret) {
  return createHmac("sha256", secret).update(`order:${orderId}`).digest("hex");
}

async function main() {
  const jwtSecret = process.env.JWT_SECRET ?? "dev-insecure";
  const paymentSecret =
    process.env.PAYMENT_WEBHOOK_SECRET?.trim() || jwtSecret;

  const stamp = Date.now();
  const adminEmail = `e2e_v41_${stamp}@example.com`;
  const orgTaxId = `${stamp}`.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
  const voen = "1234567890";

  // --- 1. Регистрация ---
  let accessToken;
  let organizationId;
  try {
    const { res, json } = await api("/api/auth/register", {
      method: "POST",
      body: {
        organizationName: `E2E Org ${stamp}`,
        taxId: orgTaxId,
        currency: "AZN",
        adminEmail,
        adminFirstName: "E2E",
        adminLastName: "Owner",
        adminPassword: "E2ETestPass1",
      },
    });
    if (!res.ok) {
      log.fail(
        "1-registration",
        `HTTP ${res.status}: ${JSON.stringify(json)}`,
      );
      process.exitCode = 1;
      return;
    }
    accessToken = json.accessToken;
    organizationId = json.organization?.id;
    if (!accessToken || !organizationId) {
      log.fail("1-registration", "Нет accessToken или organization в ответе");
      process.exitCode = 1;
      return;
    }
  } catch (e) {
    log.fail("1-registration", String(e?.message ?? e));
    process.exitCode = 1;
    return;
  }

  // Проверка подписки в БД (Prisma)
  let prisma;
  try {
    prisma = new PrismaClient();
    const sub = await prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) {
      log.fail("1-registration", "OrganizationSubscription не найдена в БД");
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    if (sub.tier !== "BUSINESS") {
      log.fail(
        "1-registration",
        `tier ожидался BUSINESS, получено ${sub.tier}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    if (!sub.isTrial) {
      log.fail("1-registration", `isTrial ожидался true, получено ${sub.isTrial}`);
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    if (!sub.expiresAt) {
      log.fail("1-registration", "expiresAt is null");
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    const daysLeft =
      (sub.expiresAt.getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 13 || daysLeft > 15) {
      log.fail(
        "1-registration",
        `expiresAt не ~14 дней вперёд: ~${daysLeft.toFixed(2)} дн.`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    log.ok(
      "1-registration",
      `isTrial=true, tier=BUSINESS, expiresAt≈14d (${sub.expiresAt.toISOString()})`,
    );
  } catch (e) {
    log.fail("1-registration", `Prisma: ${String(e?.message ?? e)}`);
    process.exitCode = 1;
    return;
  }

  // --- 2. VÖEN → контрагент ---
  let counterpartyId;
  try {
    const { res, json } = await api(
      `/api/tax/taxpayer-info?voen=${encodeURIComponent(voen)}`,
      { token: accessToken },
    );
    if (!res.ok) {
      log.fail(
        "2-voen-tax",
        `HTTP ${res.status}: ${JSON.stringify(json)} (для стабильности задайте TAX_LOOKUP_MOCK=1 в .env API)`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    const name = json.name;
    const isVatPayer = json.isVatPayer;
    if (!name || typeof name !== "string") {
      log.fail("2-voen-tax", "В ответе нет name");
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    const looksLikeHtmlStub =
      /javascript|DOCTYPE|html/i.test(name) || name.length > 400;
    if (looksLikeHtmlStub) {
      const msg =
        "Ответ похож на HTML/ошибку парсинга e-taxes. Задайте TAX_LOOKUP_MOCK=1 в .env API.";
      if (process.env.E2E_STRICT_VOEN === "1") {
        log.fail("2-voen-tax", msg);
        await prisma.$disconnect();
        process.exitCode = 1;
        return;
      }
      console.warn(`WARNING [2-voen-tax] ${msg} (для FAIL задайте E2E_STRICT_VOEN=1)`);
    }

    const createRes = await api("/api/counterparties", {
      method: "POST",
      token: accessToken,
      body: {
        name,
        taxId: voen,
        kind: "LEGAL_ENTITY",
        role: "CUSTOMER",
        address: json.address ?? undefined,
        isVatPayer: typeof isVatPayer === "boolean" ? isVatPayer : undefined,
      },
    });
    if (!createRes.res.ok) {
      log.fail(
        "2-voen-counterparty",
        `HTTP ${createRes.res.status}: ${JSON.stringify(createRes.json)}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    counterpartyId = createRes.json.id;
    const list = await api("/api/counterparties", { token: accessToken });
    const arr = Array.isArray(list.json) ? list.json : [];
    const found = arr.find((c) => c.id === counterpartyId);
    if (!found || found.name !== name) {
      log.fail(
        "2-voen-counterparty",
        "Контрагент не найден в списке или name не совпадает",
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    log.ok(
      "2-voen",
      `TaxService name="${name.slice(0, 40)}…", контрагент сохранён id=${counterpartyId}`,
    );
  } catch (e) {
    log.fail("2-voen", String(e?.message ?? e));
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  // --- 3. READ_ONLY: истечение подписки в БД ---
  try {
    await prisma.organizationSubscription.update({
      where: { organizationId },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });

    const invRes = await api("/api/invoices", {
      method: "POST",
      token: accessToken,
      body: {
        counterpartyId,
        dueDate: "2026-12-31",
        items: [
          {
            description: "E2E line",
            quantity: 1,
            unitPrice: 10,
            vatRate: 0,
          },
        ],
      },
    });
    if (invRes.res.status !== 403) {
      log.fail(
        "3-readonly",
        `Ожидался HTTP 403, получен ${invRes.res.status}: ${invRes.text?.slice(0, 200)}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    const code = invRes.json?.code;
    if (code !== "SUBSCRIPTION_READ_ONLY") {
      log.fail(
        "3-readonly",
        `code ожидался SUBSCRIPTION_READ_ONLY, получено ${code}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    log.ok("3-readonly", "POST /api/invoices → 403 SUBSCRIPTION_READ_ONLY");
  } catch (e) {
    log.fail("3-readonly", String(e?.message ?? e));
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  // --- 4. Mock оплата ---
  try {
    const checkout = await api("/api/billing/checkout", {
      method: "POST",
      token: accessToken,
      body: { amountAzn: 1, months: 1 },
    });
    if (!checkout.res.ok) {
      log.fail(
        "4-checkout",
        `HTTP ${checkout.res.status}: ${JSON.stringify(checkout.json)}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    const orderId = checkout.json.orderId;
    const token = signOrderToken(orderId, paymentSecret);
    const mockUrl = `${BASE}/api/public/billing/mock-pay?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
    const payRes = await fetch(mockUrl, { redirect: "manual" });
    if (payRes.status !== 302 && payRes.status !== 303) {
      log.fail(
        "4-mock-pay",
        `mock-pay ожидался редирект 302/303, получен ${payRes.status}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }

    const subAfter = await prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!subAfter) {
      log.fail("4-payment", "Подписка не найдена после оплаты");
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    if (subAfter.isTrial) {
      log.fail(
        "4-payment",
        `isTrial должен быть false после оплаты, получено ${subAfter.isTrial}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    if (!subAfter.expiresAt || subAfter.expiresAt.getTime() <= Date.now()) {
      log.fail(
        "4-payment",
        `expiresAt должен быть в будущем, получено ${subAfter.expiresAt?.toISOString()}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    log.ok(
      "4-payment",
      `isTrial=false, expiresAt=${subAfter.expiresAt.toISOString()}`,
    );

    const invAfter = await api("/api/invoices", {
      method: "POST",
      token: accessToken,
      body: {
        counterpartyId,
        dueDate: "2026-12-31",
        items: [
          {
            description: "E2E after pay",
            quantity: 1,
            unitPrice: 20,
            vatRate: 0,
          },
        ],
      },
    });
    if (!invAfter.res.ok) {
      log.fail(
        "4-invoice-after-pay",
        `HTTP ${invAfter.res.status}: ${JSON.stringify(invAfter.json)}`,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    log.ok(
      "4-mutations-restored",
      `POST /api/invoices после оплаты → ${invAfter.res.status}, id=${invAfter.json?.id}`,
    );
  } catch (e) {
    log.fail("4-payment", String(e?.message ?? e));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();

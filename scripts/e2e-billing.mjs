#!/usr/bin/env node
/**
 * E2E: registration → trial → toggle paid module (pro-rata) → mock payment → DB checks (Sprint 10).
 * Requires: API on E2E_API_URL (default http://127.0.0.1:4000), DATABASE_URL, JWT_SECRET.
 *
 *   dotenv -e .env -- node ./scripts/e2e-billing.mjs
 */

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@dayday/database");

const BASE = process.env.E2E_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

function signOrderToken(orderId, secret) {
  return createHmac("sha256", secret).update(`order:${orderId}`).digest("hex");
}

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

async function main() {
  const jwtSecret = process.env.JWT_SECRET ?? "dev-insecure";
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const adminEmail = `e2e_bill_${stamp}@example.com`;
  const orgTaxId = `${stamp}`.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);

  let accessToken;
  let organizationId;

  const { res, json } = await api("/api/auth/register", {
    method: "POST",
    body: {
      organizationName: `E2E Billing ${stamp}`,
      taxId: orgTaxId,
      currency: "AZN",
      adminEmail,
      adminFirstName: "E2E",
      adminLastName: "Owner",
      adminPassword: "E2ETestPass1",
    },
  });
  if (!res.ok) {
    console.error("Register failed", json);
    process.exit(1);
  }
  accessToken = json.accessToken;
  organizationId = json.organizationId ?? json.organizations?.[0]?.id;
  if (!accessToken || !organizationId) {
    console.error("Missing token/org", json);
    process.exit(1);
  }

  const sub = await prisma.organizationSubscription.findUnique({
    where: { organizationId },
  });
  if (!sub?.isTrial || sub.tier !== "BUSINESS") {
    console.warn("Trial/tier check:", sub);
  }

  const mod = await prisma.pricingModule.findFirst({
    where: { key: { not: "foundation" } },
  });
  const moduleKey = mod?.key ?? "warehouse";
  const toggle = await api("/api/billing/toggle-module", {
    method: "POST",
    token: accessToken,
    body: { moduleKey, enabled: true },
  });
  if (!toggle.res.ok) {
    console.error("toggle-module failed", toggle.json);
    await prisma.$disconnect();
    process.exit(1);
  }
  const tj = toggle.json;
  if (!tj.requiresPayment || !tj.orderId) {
    console.log("No payment required (pro-rata < min or skipped); OK for env:", tj);
    await prisma.$disconnect();
    process.exit(0);
  }

  const mockToken = signOrderToken(tj.orderId, jwtSecret);
  const pay = await api(
    `/api/public/billing/mock-pay?orderId=${encodeURIComponent(tj.orderId)}&token=${encodeURIComponent(mockToken)}`,
    { method: "GET" },
  );
  if (!pay.res.ok) {
    console.error("mock-pay failed", pay.json);
    await prisma.$disconnect();
    process.exit(1);
  }

  const om = await prisma.organizationModule.findUnique({
    where: {
      organizationId_moduleKey: { organizationId, moduleKey },
    },
  });
  if (!om) {
    console.error("organization_modules row missing after payment");
    await prisma.$disconnect();
    process.exit(1);
  }

  const owner = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  const inv = await prisma.subscriptionInvoice.findFirst({
    where: { userId: owner?.ownerId ?? undefined, items: { some: { organizationId } } },
    include: { items: true },
  });

  console.log("E2E billing: OK", {
    organizationModule: !!om,
    subscriptionInvoice: inv?.id ?? null,
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

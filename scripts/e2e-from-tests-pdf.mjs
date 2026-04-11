#!/usr/bin/env node
/**
 * E2E по кейсам из tests/e2e-from-tests-pdf.cases.json
 *
 *   npm run test:e2e:pdf
 *   E2E_API_URL=http://127.0.0.1:4000 npm run test:e2e:pdf
 */

const BASE = process.env.E2E_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

function rnd10() {
  const n = String(Date.now() % 10_000_000_000).padStart(10, "0");
  return n.length > 10 ? n.slice(-10) : n.padStart(10, "0");
}

function monthRangeUtcNow() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const pad = (n) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
    year: y,
    month: m,
  };
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
  return { ok: res.ok, status: res.status, json, text };
}

/** multipart/form-data (банк CSV) */
async function apiForm(path, { token, form }) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];

async function runCase(id, fn) {
  try {
    await fn();
    results.push({ id, ok: true });
    console.log(`OK  ${id}`);
  } catch (e) {
    results.push({ id, ok: false, error: String(e?.message ?? e) });
    console.error(`FAIL ${id}: ${e?.message ?? e}`);
  }
}

async function main() {
  console.log(`E2E API: ${BASE}\n`);

  const taxId = rnd10();
  const email = `e2e.pdf.${Date.now()}@example.com`;
  const password = "E2ETestPass1";

  let token = null;
  let counterpartyId = null;
  let productId = null;
  let invoiceId = null;
  let warehouseId = null;

  await runCase("E01-A1", async () => {
    const r = await api("/api/auth/register", {
      method: "POST",
      body: {
        organizationName: `E2E Org ${taxId}`,
        taxId,
        adminEmail: email,
        adminFirstName: "PDF",
        adminLastName: "Test",
        adminPassword: password,
      },
    });
    assert(r.ok, `register ${r.status}: ${r.text}`);
    assert(r.json?.accessToken, "no accessToken");
    token = r.json.accessToken;
  });

  if (!token) {
    console.error("Регистрация не удалась — остальные тесты пропущены.");
    process.exit(1);
  }

  await runCase("E02-B1", async () => {
    const r = await api("/api/counterparties", {
      method: "POST",
      token,
      body: {
        name: "PDF Test Counterparty",
        taxId: rnd10(),
        kind: "LEGAL_ENTITY",
        role: "CUSTOMER",
        email: "cp.pdf.test@example.com",
      },
    });
    assert(r.ok, `counterparty create ${r.status}: ${r.text}`);
    counterpartyId = r.json?.id;
    assert(counterpartyId, "no counterparty id");
    const list = await api("/api/counterparties", { token });
    assert(list.ok, `counterparty list ${list.status}`);
    assert(Array.isArray(list.json), "list not array");
    assert(list.json.some((x) => x.id === counterpartyId), "cp not in list");
  });

  await runCase("E03-B2", async () => {
    const sku = `SKU-PDF-${Date.now()}`;
    const r = await api("/api/products", {
      method: "POST",
      token,
      body: { name: "PDF Test Product", sku, price: 100, vatRate: 18 },
    });
    assert(r.ok, `product create ${r.status}: ${r.text}`);
    productId = r.json?.id;
    assert(productId, "no product id");
    const list = await api("/api/products", { token });
    assert(list.json?.some((p) => p.id === productId), "product not in list");
  });

  await runCase("E04-B3", async () => {
    assert(counterpartyId && productId, "missing cp or product");
    const today = new Date().toISOString().slice(0, 10);
    const r = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId,
        dueDate: today,
        debitAccountCode: "101",
        items: [{ productId, quantity: 1, unitPrice: 100, vatRate: 18 }],
      },
    });
    assert(r.ok, `invoice create ${r.status}: ${r.text}`);
    invoiceId = r.json?.id;
    assert(invoiceId, "no invoice id");
    assert(r.json?.status === "DRAFT", `expected DRAFT, got ${r.json?.status}`);
  });

  await runCase("E05-B4", async () => {
    const r = await api(`/api/invoices/${invoiceId}/status`, {
      method: "PATCH",
      token,
      body: { status: "SENT" },
    });
    assert(r.ok, `SENT ${r.status}: ${r.text}`);
    assert(r.json?.status === "SENT", `expected SENT, got ${r.json?.status}`);
  });

  await runCase("E06-B5", async () => {
    const r = await api(`/api/invoices/${invoiceId}/status`, {
      method: "PATCH",
      token,
      body: { status: "PAID" },
    });
    assert(r.ok, `PAID ${r.status}: ${r.text}`);
    assert(r.json?.status === "PAID", `expected PAID, got ${r.json?.status}`);
  });

  await runCase("E07-D1+D2", async () => {
    const w = await api("/api/inventory/warehouses", {
      method: "POST",
      token,
      body: { name: `WH-PDF-${Date.now()}`, location: "Test" },
    });
    assert(w.ok, `warehouse ${w.status}: ${w.text}`);
    warehouseId = w.json?.id;
    assert(warehouseId, "no warehouse id");

    const pur = await api("/api/inventory/purchase", {
      method: "POST",
      token,
      body: {
        warehouseId,
        lines: [{ productId, quantity: 5, unitPrice: 10 }],
        reference: "E2E-PDF",
      },
    });
    assert(pur.ok, `purchase ${pur.status}: ${pur.text}`);

    const stock = await api(`/api/inventory/stock?warehouseId=${warehouseId}`, { token });
    assert(stock.ok, `stock ${stock.status}`);
    assert(Array.isArray(stock.json), "stock not array");
    assert(stock.json.length >= 1, "expected stock rows after purchase");
  });

  await runCase("E08-C1", async () => {
    const r = await api("/api/reporting/receivables", { token });
    assert(r.ok, `receivables ${r.status}: ${r.text}`);
    assert(r.json?.accountCode, "receivables: no accountCode");
    assert(Array.isArray(r.json?.rows), "receivables.rows not array");
  });

  await runCase("E09-G1", async () => {
    const { from, to } = monthRangeUtcNow();
    const r = await api(
      `/api/reporting/trial-balance?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      { token },
    );
    assert(r.ok, `tb ${r.status}: ${r.text}`);
    assert(Array.isArray(r.json?.rows), "tb.rows not array");
    assert(r.json.rows.length >= 1, "tb empty rows");
  });

  await runCase("E10-F1", async () => {
    const fin = `A${String(Date.now()).slice(-6)}`;
    assert(fin.length === 7, "FIN must be 7 chars");
    const r = await api("/api/hr/employees", {
      method: "POST",
      token,
      body: {
        finCode: fin,
        firstName: "Pdf",
        lastName: "Test",
        position: "QA",
        startDate: new Date().toISOString().slice(0, 10),
        salary: 2500,
      },
    });
    assert(r.ok, `employee ${r.status}: ${r.text}`);
    const list = await api("/api/hr/employees", { token });
    assert(list.ok, `employees list ${list.status}`);
    assert(list.json?.some((e) => e.finCode === fin), "employee not in list");
  });

  let invoiceH2 = null;
  await runCase("E11-H2", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const cr = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId,
        dueDate: today,
        debitAccountCode: "101",
        items: [{ productId, quantity: 1, unitPrice: 10, vatRate: 18 }],
      },
    });
    assert(cr.ok, `invoice H2 ${cr.status}`);
    invoiceH2 = cr.json?.id;
    const p1 = await api(`/api/invoices/${invoiceH2}/status`, {
      method: "PATCH",
      token,
      body: { status: "PAID" },
    });
    assert(p1.ok, `first PAID ${p1.status}`);
    const p2 = await api(`/api/invoices/${invoiceH2}/status`, {
      method: "PATCH",
      token,
      body: { status: "PAID" },
    });
    assert(p2.ok, `second PAID ${p2.status}`);
    assert(p2.json?.status === "PAID", "still PAID");
  });

  let invoiceB6 = null;
  await runCase("E12-B6", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const cr = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId,
        dueDate: today,
        debitAccountCode: "101",
        warehouseId,
        items: [{ productId, quantity: 1, unitPrice: 50, vatRate: 18 }],
      },
    });
    assert(cr.ok, `B6 draft ${cr.status}`);
    invoiceB6 = cr.json?.id;
    const paid = await api(`/api/invoices/${invoiceB6}/status`, {
      method: "PATCH",
      token,
      body: { status: "PAID" },
    });
    assert(paid.ok, `B6 PAID ${paid.status}`);
    assert(paid.json?.status === "PAID", "expected PAID direct");
  });

  await runCase("E13-B7", async () => {
    const r = await api(`/api/invoices/${invoiceB6}/send-email`, {
      method: "POST",
      token,
    });
    assert(r.ok, `send-email ${r.status}: ${r.text}`);
    assert(r.json?.ok === true || r.json?.sentTo, "expected ok/sentTo");
  });

  await runCase("E14-C2", async () => {
    const cpTax = rnd10();
    const cp = await api("/api/counterparties", {
      method: "POST",
      token,
      body: {
        name: "C2 Receivables CP",
        taxId: cpTax,
        kind: "LEGAL_ENTITY",
        role: "CUSTOMER",
      },
    });
    assert(cp.ok, `C2 cp ${cp.status}`);
    const cpId = cp.json?.id;
    const today = new Date().toISOString().slice(0, 10);
    const inv = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId: cpId,
        dueDate: today,
        debitAccountCode: "101",
        warehouseId,
        items: [{ productId, quantity: 1, unitPrice: 200, vatRate: 18 }],
      },
    });
    assert(inv.ok, `C2 invoice ${inv.status}`);
    const iid = inv.json?.id;
    const sent = await api(`/api/invoices/${iid}/status`, {
      method: "PATCH",
      token,
      body: { status: "SENT" },
    });
    assert(sent.ok, `C2 SENT ${sent.status}`);
    const rec1 = await api("/api/reporting/receivables", { token });
    assert(rec1.ok, "rec1");
    const rowBefore = rec1.json?.rows?.find((r) => r.counterpartyId === cpId);
    assert(rowBefore, "expected receivable row before PAID");
    const paid = await api(`/api/invoices/${iid}/status`, {
      method: "PATCH",
      token,
      body: { status: "PAID" },
    });
    assert(paid.ok, `C2 PAID ${paid.status}`);
    const rec2 = await api("/api/reporting/receivables", { token });
    assert(rec2.ok, "rec2");
    const rowAfter = rec2.json?.rows?.find((r) => r.counterpartyId === cpId);
    assert(!rowAfter, "receivable row for CP should disappear after PAID");
  });

  await runCase("E15-A2", async () => {
    const noAuth = await api("/api/products");
    assert(noAuth.status === 401, `expected 401 without token, got ${noAuth.status}`);
    const lo = await api("/api/auth/logout", { method: "POST", token });
    assert(lo.ok, `logout ${lo.status}`);
    const again = await api("/api/products");
    assert(again.status === 401, "401 after logout without token");
    const lg = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert(lg.ok, `login ${lg.status}`);
    assert(lg.json?.accessToken, "new accessToken");
    token = lg.json.accessToken;
    const ok = await api("/api/products", { token });
    assert(ok.ok, "products with new token");
  });

  let productEmptyId = null;
  await runCase("E16-D3+D4", async () => {
    await api("/api/inventory/settings", {
      method: "PATCH",
      token,
      body: { allowNegativeStock: false },
    });
    const pr = await api("/api/products", {
      method: "POST",
      token,
      body: {
        name: "No Stock SKU",
        sku: `EMPTY-${Date.now()}`,
        price: 20,
        vatRate: 18,
      },
    });
    assert(pr.ok, `empty product ${pr.status}`);
    productEmptyId = pr.json?.id;
    const today = new Date().toISOString().slice(0, 10);
    const inv = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId,
        dueDate: today,
        debitAccountCode: "101",
        warehouseId,
        items: [{ productId: productEmptyId, quantity: 100, unitPrice: 20, vatRate: 18 }],
      },
    });
    assert(inv.ok, `D3 draft ${inv.status}`);
    const iid = inv.json?.id;
    const fail = await api(`/api/invoices/${iid}/status`, {
      method: "PATCH",
      token,
      body: { status: "SENT" },
    });
    assert(!fail.ok && fail.status === 400, `D3 expected 400, got ${fail.status}`);
    const patch = await api("/api/inventory/settings", {
      method: "PATCH",
      token,
      body: { allowNegativeStock: true },
    });
    assert(patch.ok, `allow neg ${patch.status}`);
    const ok = await api(`/api/invoices/${iid}/status`, {
      method: "PATCH",
      token,
      body: { status: "SENT" },
    });
    assert(ok.ok, `D4 SENT ${ok.status}`);
    await api("/api/inventory/settings", {
      method: "PATCH",
      token,
      body: { allowNegativeStock: false },
    });
  });

  await runCase("E17-E1+E2+E3", async () => {
    const bankTax = rnd10();
    const cpb = await api("/api/counterparties", {
      method: "POST",
      token,
      body: {
        name: "Bank Match CP",
        taxId: bankTax,
        kind: "LEGAL_ENTITY",
        role: "CUSTOMER",
      },
    });
    assert(cpb.ok, `bank cp ${cpb.status}`);
    const cpBid = cpb.json?.id;
    const today = new Date().toISOString().slice(0, 10);
    const inv = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId: cpBid,
        dueDate: today,
        debitAccountCode: "101",
        warehouseId,
        items: [{ productId, quantity: 1, unitPrice: 100, vatRate: 18 }],
      },
    });
    assert(inv.ok, `bank inv draft ${inv.status}`);
    const invBankId = inv.json?.id;
    const one = await api(`/api/invoices/${invBankId}`, { token });
    assert(one.ok, "get invoice");
    const totalStr = String(one.json?.totalAmount ?? "");
    const sent = await api(`/api/invoices/${invBankId}/status`, {
      method: "PATCH",
      token,
      body: { status: "SENT" },
    });
    assert(sent.ok, `bank inv SENT ${sent.status}`);
    const csv = [
      "Date,Description,Amount,VÖEN",
      `2026-03-15,E2E good inflow,${totalStr},${bankTax}`,
      `2026-03-16,E2E bad amount,999999.99,${bankTax}`,
    ].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "e2e-bank.csv");
    form.append("bankName", "E2E Test Bank");
    const imp = await apiForm("/api/banking/import", { token, form });
    assert(imp.ok, `import ${imp.status}: ${imp.text}`);
    const stmtId = imp.json?.id;
    assert(stmtId, "statement id");
    const lines = await api(
      `/api/banking/lines?unmatchedOnly=true&bankStatementId=${encodeURIComponent(stmtId)}`,
      { token },
    );
    assert(lines.ok && Array.isArray(lines.json), "lines");
    assert(lines.json.length >= 2, "expected 2 lines");
    const lineGood = lines.json.find((l) => String(l.description ?? "").includes("good"));
    const lineBad = lines.json.find((l) => String(l.description ?? "").includes("bad"));
    assert(lineGood && lineBad, "line ids");
    const candOk = await api(`/api/banking/lines/${lineGood.id}/candidates`, { token });
    assert(candOk.ok, "candidates good");
    assert(
      (candOk.json?.candidates?.length ?? 0) >= 1,
      "expected invoice candidate for matching line",
    );
    const candBad = await api(`/api/banking/lines/${lineBad.id}/candidates`, { token });
    assert(candBad.ok, "candidates bad");
    assert(
      (candBad.json?.candidates?.length ?? 0) === 0,
      "wrong amount must not match invoice",
    );
    const m = await api(`/api/banking/lines/${lineGood.id}/match`, {
      method: "POST",
      token,
      body: { invoiceId: invBankId },
    });
    assert(m.ok, `match ${m.status}: ${m.text}`);
  });

  await runCase("E18-F2+F3", async () => {
    const year = 2032;
    const month = 11;
    const run = await api("/api/hr/payroll/runs", {
      method: "POST",
      token,
      body: { year, month },
    });
    assert(run.ok, `payroll draft ${run.status}: ${run.text}`);
    const rid = run.json?.id;
    assert(rid, "payroll run id");
    assert(Array.isArray(run.json?.slips) && run.json.slips.length >= 1, "slips");
    const post = await api(`/api/hr/payroll/runs/${rid}/post`, { method: "POST", token });
    assert(post.ok, `payroll post ${post.status}: ${post.text}`);
  });

  await runCase("E19-G2+G3", async () => {
    const { from, to } = monthRangeUtcNow();
    const pl = await api(
      `/api/reporting/pl?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      { token },
    );
    assert(pl.ok, `pl ${pl.status}`);
    assert(Array.isArray(pl.json?.lines), "pl.lines");
    assert(pl.json?.netProfit != null, "netProfit");
    const dash = await api("/api/reporting/dashboard", { token });
    assert(dash.ok, `dashboard ${dash.status}`);
    assert(dash.json?.cashBankBalance != null, "cashBankBalance");
    assert(dash.json?.obligations521531Balance != null, "obligations521531Balance");
    assert(dash.json?.currentMonthExpense721 != null, "currentMonthExpense721");
    assert(Array.isArray(dash.json?.topProducts), "topProducts");
    assert(Array.isArray(dash.json?.revenueByDay), "revenueByDay");
  });

  await runCase("E20-H1", async () => {
    const r = await api("/api/audit/recent?take=30", { token });
    assert(r.ok, `audit ${r.status}: ${r.text}`);
    assert(Array.isArray(r.json), "audit array");
    assert(r.json.length >= 1, "expected audit rows after mutations");
    const http = r.json.filter((x) => x.entityType === "HTTP_MUTATION");
    assert(http.length >= 1, "expected HTTP_MUTATION audit entries");
  });

  await runCase("E21-G4", async () => {
    const { year, month } = monthRangeUtcNow();
    const cl = await api("/api/reporting/close-period", {
      method: "POST",
      token,
      body: { year, month },
    });
    assert(cl.ok, `close-period ${cl.status}: ${cl.text}`);
    assert(cl.json?.closedPeriod, "closedPeriod key");
    const today = new Date().toISOString().slice(0, 10);
    const inv = await api("/api/invoices", {
      method: "POST",
      token,
      body: {
        counterpartyId,
        dueDate: today,
        debitAccountCode: "101",
        items: [{ productId, quantity: 1, unitPrice: 1, vatRate: 0 }],
      },
    });
    assert(inv.ok, `post-close draft ${inv.status}`);
    const iid = inv.json?.id;
    const blocked = await api(`/api/invoices/${iid}/status`, {
      method: "PATCH",
      token,
      body: { status: "SENT" },
    });
    assert(!blocked.ok && blocked.status === 400, `G4 expected 400, got ${blocked.status}`);
    assert(
      String(blocked.text).toLowerCase().includes("закрыт") ||
        String(blocked.text).toLowerCase().includes("closed"),
      "error should mention closed period",
    );
  });

  const failed = results.filter((x) => !x.ok);
  console.log("\n---");
  console.log(`Passed: ${results.filter((x) => x.ok).length}/${results.length}`);
  if (failed.length) {
    console.log("Failed:", failed.map((f) => `${f.id}: ${f.error}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

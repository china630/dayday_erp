/**
 * Демо-данные для презентационных скриншотов (TiVi Media и сфера медиа/продакшн).
 * Запуск: из корня монорепо `npm run db:seed:tivi` (подмешивается `.env`).
 * Организация: по умолчанию ищется по подстроке «TiVi Media»; иначе `SEED_TIVI_ORG_NAME`.
 * Повтор без дублей: метка в `organization.settings.tiviSeedDemo`; принудительно: `SEED_TIVI_FORCE=1`.
 *
 * Бухгалтерия: проводки NAS сбалансированы (ΣДт = ΣКт) по образцу AccountingService / PayrollService.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { faker } from "@faker-js/faker";
import {
  AccountType,
  AdvanceReportStatus,
  CashOrderKind,
  CashOrderPkoSubtype,
  CashOrderRkoSubtype,
  CashOrderStatus,
  CounterpartyKind,
  CounterpartyRole,
  Decimal,
  EmployeeKind,
  InvoiceStatus,
  LedgerType,
  PayrollRunStatus,
  Prisma,
  PrismaClient,
  SubscriptionTier,
  TimesheetEntryType,
  TimesheetStatus,
} from "@prisma/client";
import { closePrismaPool, createPrismaClient } from "./prisma-client";
import { calculatePrivateNonOilPayroll } from "../../../apps/api/src/hr/payroll-calculator.ts";
import { isAzWorkingDay } from "../../../apps/api/src/hr/calendar/az-2026.ts";
import { loadChartJson, seedChartOfAccountsForOrganization } from "./chart-seed.ts";
import { PRICING_MODULE_SEED_DEFAULTS } from "./pricing-module-seed.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const PAYROLL_EXPENSE = "721";
const PAYROLL_PAYABLE = "533";
const PAYROLL_TAX = "521";
const RECEIVABLE = "211";
const REVENUE = "601";
const MAIN_BANK = "221";
const CASH_OP = "101.01";
const MISC_EXP = "731";

const f = faker;

if (process.env.NODE_ENV === "production") {
  console.error("[seed-tivi] Отказ: NODE_ENV=production");
  process.exit(1);
}

const prisma = createPrismaClient();

const SEED_MARKER = "tiviSeedDemo";

function assertBalanced(lines: Array<{ debit: Decimal; credit: Decimal }>): void {
  let dr = new Decimal(0);
  let cr = new Decimal(0);
  for (const l of lines) {
    dr = dr.add(l.debit);
    cr = cr.add(l.credit);
  }
  if (!dr.equals(cr) || dr.lte(0)) {
    throw new Error(`Unbalanced journal: Dr ${dr.toString()} Cr ${cr.toString()}`);
  }
}

async function getAccountId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  code: string,
): Promise<string> {
  const a = await tx.account.findFirst({
    where: { organizationId, code, ledgerType: LedgerType.NAS },
  });
  if (!a) throw new Error(`Счёт ${code} не найден для организации (сначала план счетов)`);
  return a.id;
}

async function postJournal(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    date: Date;
    reference?: string;
    description?: string;
    isFinal?: boolean;
    counterpartyId?: string | null;
    lines: Array<{ accountCode: string; debit: string; credit: string }>;
  },
): Promise<string> {
  const { organizationId, date, reference, description, isFinal, counterpartyId, lines } = params;
  const decLines = lines.map((l) => ({
    accountCode: l.accountCode,
    debit: new Decimal(l.debit),
    credit: new Decimal(l.credit),
  }));
  assertBalanced(
    decLines.map((l) => ({
      debit: l.debit,
      credit: l.credit,
    })),
  );

  const codes = [...new Set(lines.map((l) => l.accountCode))];
  const accounts = await tx.account.findMany({
    where: { organizationId, code: { in: codes }, ledgerType: LedgerType.NAS },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  for (const c of codes) {
    if (!byCode.has(c)) throw new Error(`Счёт ${c} не найден`);
  }

  const trx = await tx.transaction.create({
    data: {
      organizationId,
      date,
      reference: reference ?? null,
      description: description ?? null,
      isFinal: isFinal ?? true,
      counterpartyId: counterpartyId ?? null,
    },
  });

  for (const l of lines) {
    const acc = byCode.get(l.accountCode)!;
    await tx.journalEntry.create({
      data: {
        organizationId,
        transactionId: trx.id,
        accountId: acc.id,
        debit: new Decimal(l.debit),
        credit: new Decimal(l.credit),
        ledgerType: LedgerType.NAS,
      },
    });
  }
  return trx.id;
}

async function ensureAccountable244(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const p215 = await tx.account.findFirst({
    where: { organizationId, code: "215", ledgerType: LedgerType.NAS },
  });
  if (!p215) return;

  await tx.account.upsert({
    where: {
      organizationId_code_ledgerType: {
        organizationId,
        code: "244",
        ledgerType: LedgerType.NAS,
      },
    },
    create: {
      organizationId,
      code: "244",
      nameAz: "Hesab verən şəxslər (qrup)",
      nameRu: "Подотчётные лица (группа)",
      nameEn: "Accountable persons (group)",
      type: AccountType.ASSET,
      ledgerType: LedgerType.NAS,
      parentId: p215.id,
    },
    update: {},
  });
  const p244 = await tx.account.findFirstOrThrow({
    where: { organizationId, code: "244", ledgerType: LedgerType.NAS },
  });
  await tx.account.upsert({
    where: {
      organizationId_code_ledgerType: {
        organizationId,
        code: "244.01",
        ledgerType: LedgerType.NAS,
      },
    },
    create: {
      organizationId,
      code: "244.01",
      nameAz: "Təhtəlhesab — əməkdaşlar (demo)",
      nameRu: "Подотчёт — сотрудники (демо)",
      nameEn: "Accountable persons — staff (demo)",
      type: AccountType.ASSET,
      ledgerType: LedgerType.NAS,
      parentId: p244.id,
    },
    update: {},
  });
}

async function ensureSubscriptionAndModules(orgId: string): Promise<void> {
  const modKeys = [
    ...new Set([
      ...PRICING_MODULE_SEED_DEFAULTS.map((m) => m.key),
      "production",
      "fixed_assets",
      "ifrs",
      "banking_pro",
      "hr_full",
      "kassa_pro",
      "inventory",
      "manufacturing",
    ]),
  ];

  await prisma.organizationSubscription.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      tier: SubscriptionTier.ENTERPRISE,
      activeModules: modKeys,
      isTrial: false,
      isBlocked: false,
    },
    update: {
      tier: SubscriptionTier.ENTERPRISE,
      activeModules: modKeys,
      isBlocked: false,
    },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { activeModules: modKeys },
  });

  for (const key of modKeys) {
    await prisma.organizationModule.upsert({
      where: {
        organizationId_moduleKey: { organizationId: orgId, moduleKey: key },
      },
      create: {
        organizationId: orgId,
        moduleKey: key,
        priceSnapshot: new Decimal(0),
      },
      update: {},
    });
  }
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String(f.number.int({ min: 0, max: 9 }));
  return s;
}

async function main(): Promise<void> {
  const orgNameNeedle =
    process.env.SEED_TIVI_ORG_NAME?.trim() || "TiVi Media";
  const org = await prisma.organization.findFirst({
    where: { name: { contains: orgNameNeedle, mode: "insensitive" } },
  });
  if (!org) {
    throw new Error(
      `Не найдена организация с "${orgNameNeedle}" в названии. Создайте компанию (например «TiVi Media») или задайте SEED_TIVI_ORG_NAME=... и повторите.`,
    );
  }

  const prev = org.settings as Record<string, unknown> | null;
  if (process.env.SEED_TIVI_FORCE !== "1" && prev?.[SEED_MARKER]) {
    console.info(
      `[seed-tivi] Демо уже загружено (${SEED_MARKER}). Повтор: SEED_TIVI_FORCE=1 npm run db:seed:tivi`,
    );
    return;
  }

  console.info(`[seed-tivi] Организация: ${org.name} (${org.id})`);

  const chart = await loadChartJson();
  await seedChartOfAccountsForOrganization(prisma, org.id, chart);
  await prisma.$transaction(async (tx) => {
    await ensureAccountable244(tx, org.id);
  });

  await ensureSubscriptionAndModules(org.id);

  const rnd = (min: number, max: number) => f.number.int({ min, max });

  /* ---------- Контрагенты ---------- */
  const supplierNames = [
    "Blackmagic Distribution AZ",
    "Arenacam Rental Baku",
    "Freelance Light Crew",
    "Studio Sound Pro",
    "LED Wall Rent LLC",
  ];
  const clientNames = [
    "P&G Caucasus",
    "Coca-Cola Azerbaijan",
    "Baku Agency Group",
    "Local Brand House",
    "Startap Media MMC",
  ];

  const counterparties: { id: string; role: CounterpartyRole; name: string }[] = [];
  let taxSeq = Date.now() % 1_000_000_000;
  for (let i = 0; i < 12; i++) {
    const name = `${supplierNames[i % supplierNames.length]} ${i > 4 ? `#${i}` : ""}`.trim();
    const taxId = String(taxSeq++).padStart(10, "0").slice(-10);
    const cp = await prisma.counterparty.create({
      data: {
        organizationId: org.id,
        name,
        taxId,
        kind: CounterpartyKind.LEGAL_ENTITY,
        role: CounterpartyRole.SUPPLIER,
        legalForm: "LLC",
        isVatPayer: false,
        email: `supplier${i}@demo.tivi.local`,
      },
    });
    counterparties.push({ id: cp.id, role: CounterpartyRole.SUPPLIER, name });
  }
  for (let i = 0; i < 16; i++) {
    const name = `${clientNames[i % clientNames.length]} ${i > 4 ? `#${i}` : ""}`.trim();
    const taxId = String(taxSeq++).padStart(10, "0").slice(-10);
    const cp = await prisma.counterparty.create({
      data: {
        organizationId: org.id,
        name,
        taxId,
        kind: CounterpartyKind.LEGAL_ENTITY,
        role: CounterpartyRole.CUSTOMER,
        legalForm: "LLC",
        isVatPayer: false,
        email: `client${i}@demo.tivi.local`,
      },
    });
    counterparties.push({ id: cp.id, role: CounterpartyRole.CUSTOMER, name });
  }

  /* ---------- Продукты / услуги ---------- */
  const serviceNames = [
    "Рекламный ролик 30 сек",
    "Рекламный ролик 60 сек",
    "Аренда камеры ARRI",
    "Аренда объектива",
    "Монтаж видео (час)",
    "Цветокоррекция",
    "Запись закадра",
    "Графика и motion",
    "Услуги оператора смена",
    "Студия звукозаписи (день)",
    "Световое оборудование",
    "Кран / стедикам",
    "Дрон съёмка",
    "Постпродакшн пакет",
    "Локация / съёмочная площадка",
    "Кастинг и актёры",
    "Креатив и сценарий",
    "Продюсирование",
  ];
  const products: { id: string; sku: string }[] = [];
  for (let i = 0; i < serviceNames.length; i++) {
    const p = await prisma.product.create({
      data: {
        organizationId: org.id,
        name: serviceNames[i]!,
        sku: `TIVI-SRV-${String(i + 1).padStart(3, "0")}`,
        price: new Decimal(rnd(80, 1200)),
        vatRate: new Decimal(18),
      },
    });
    products.push({ id: p.id, sku: p.sku });
  }

  /* ---------- Подразделения и должности ---------- */
  const deptSpecs = [
    { name: "Руководство", jobs: [{ name: "Генеральный директор", min: 2500, max: 3000, slots: 2 }] },
    {
      name: "Продакшн",
      jobs: [
        { name: "Продюсер", min: 1500, max: 2200, slots: 4 },
        { name: "Режиссёр", min: 1200, max: 2000, slots: 3 },
      ],
    },
    {
      name: "Монтажёры",
      jobs: [{ name: "Монтажёр", min: 800, max: 1400, slots: 8 }],
    },
    {
      name: "Бухгалтерия",
      jobs: [{ name: "Бухгалтер", min: 900, max: 1300, slots: 3 }],
    },
  ];

  const departments: { id: string; jobPositions: { id: string; min: number; max: number }[] }[] = [];
  for (const d of deptSpecs) {
    const dep = await prisma.department.create({
      data: { organizationId: org.id, name: d.name },
    });
    const jps: { id: string; min: number; max: number }[] = [];
    for (const j of d.jobs) {
      const jp = await prisma.jobPosition.create({
        data: {
          departmentId: dep.id,
          name: j.name,
          totalSlots: j.slots,
          minSalary: new Decimal(j.min),
          maxSalary: new Decimal(j.max),
        },
      });
      jps.push({ id: jp.id, min: j.min, max: j.max });
    }
    departments.push({ id: dep.id, jobPositions: jps });
  }

  const flatPositions = departments.flatMap((d) => d.jobPositions.map((j) => ({ ...j, deptId: d.id })));
  let posIdx = 0;

  const employees: {
    id: string;
    netSample: Decimal;
    accountable244?: string | null;
  }[] = [];

  for (let i = 0; i < 18; i++) {
    const jp = flatPositions[posIdx % flatPositions.length]!;
    posIdx++;
    const gross = new Decimal(rnd(jp.min, jp.max));
    const fin = String(1000000 + i).padStart(7, "0");
    const firstName = f.person.firstName();
    const lastName = f.person.lastName();
    const accountable244 = i < 3 ? "244.01" : null;
    const emp = await prisma.employee.create({
      data: {
        organizationId: org.id,
        finCode: fin,
        firstName,
        lastName,
        positionId: jp.id,
        startDate: new Date(Date.UTC(2024, 0, 15)),
        salary: gross,
        kind: EmployeeKind.EMPLOYEE,
        voen: null,
        accountableAccountCode244: accountable244,
      },
    });
    const b = calculatePrivateNonOilPayroll(gross);
    employees.push({ id: emp.id, netSample: b.net, accountable244 });
  }

  /* ---------- Табель: два полных календарных месяца ---------- */
  const now = new Date();
  const m1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 12, 0, 0, 0));
  const m2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 12, 0, 0, 0));
  const months = [
    { y: m2.getUTCFullYear(), m: m2.getUTCMonth() + 1 },
    { y: m1.getUTCFullYear(), m: m1.getUTCMonth() + 1 },
  ];

  const timesheetIds: string[] = [];

  for (const { y, m } of months) {
    const ts = await prisma.timesheet.create({
      data: {
        organizationId: org.id,
        year: y,
        month: m,
        status: TimesheetStatus.DRAFT,
      },
    });
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const emps = await prisma.employee.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    });
    for (const emp of emps) {
      for (let d = 1; d <= lastDay; d++) {
        const work = isAzWorkingDay(y, m - 1, d);
        const dayDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
        await prisma.timesheetEntry.create({
          data: {
            timesheetId: ts.id,
            employeeId: emp.id,
            dayDate,
            type: work ? TimesheetEntryType.WORK : TimesheetEntryType.OFF,
            hours: work ? new Decimal(8) : new Decimal(0),
          },
        });
      }
    }
    await prisma.timesheet.update({
      where: { id: ts.id },
      data: { status: TimesheetStatus.APPROVED },
    });
    timesheetIds.push(ts.id);
  }

  /* ---------- Зарплата: две ведомости + проводки (721 / 533 / 521) ---------- */
  let payIdx = 0;
  for (const { y, m } of months) {
    const tsId = timesheetIds[payIdx++]!;
    const run = await prisma.payrollRun.create({
      data: {
        organizationId: org.id,
        year: y,
        month: m,
        status: PayrollRunStatus.DRAFT,
        timesheetId: tsId,
      },
    });

    const emps = await prisma.employee.findMany({ where: { organizationId: org.id } });
    let sumGross = new Decimal(0);
    let sumNet = new Decimal(0);
    let sumWorkerTaxes = new Decimal(0);
    let sumEmployer = new Decimal(0);

    for (const emp of emps) {
      const b = calculatePrivateNonOilPayroll(new Decimal(emp.salary));
      sumGross = sumGross.add(b.gross);
      sumNet = sumNet.add(b.net);
      sumWorkerTaxes = sumWorkerTaxes
        .add(b.incomeTax)
        .add(b.dsmfWorker)
        .add(b.itsWorker)
        .add(b.unemploymentWorker)
        .add(b.contractorSocialWithheld);
      sumEmployer = sumEmployer
        .add(b.dsmfEmployer)
        .add(b.itsEmployer)
        .add(b.unemploymentEmployer);

      await prisma.payrollSlip.create({
        data: {
          organizationId: org.id,
          payrollRunId: run.id,
          employeeId: emp.id,
          gross: b.gross,
          incomeTax: b.incomeTax,
          dsmfWorker: b.dsmfWorker,
          dsmfEmployer: b.dsmfEmployer,
          itsWorker: b.itsWorker,
          itsEmployer: b.itsEmployer,
          unemploymentWorker: b.unemploymentWorker,
          unemploymentEmployer: b.unemploymentEmployer,
          contractorSocialWithheld: b.contractorSocialWithheld,
          net: b.net,
          timesheetWorkDays: 20,
          timesheetVacationDays: 0,
          timesheetSickDays: 0,
          timesheetBusinessTripDays: 0,
        },
      });
    }

    const periodEnd = new Date(Date.UTC(y, m, 0, 12, 0, 0, 0));
    const ref = `PAY-${y}-${String(m).padStart(2, "0")}`;
    const cr521 = sumWorkerTaxes.add(sumEmployer);

    await prisma.$transaction(async (tx) => {
      const transactionId = await postJournal(tx, {
        organizationId: org.id,
        date: periodEnd,
        reference: ref,
        description: `Зарплата ${m}/${y} (демо TiVi)`,
        isFinal: true,
        lines: [
          { accountCode: PAYROLL_EXPENSE, debit: sumGross.toString(), credit: "0" },
          { accountCode: PAYROLL_EXPENSE, debit: sumEmployer.toString(), credit: "0" },
          { accountCode: PAYROLL_PAYABLE, debit: "0", credit: sumNet.toString() },
          { accountCode: PAYROLL_TAX, debit: "0", credit: cr521.toString() },
        ],
      });
      await tx.payrollRun.update({
        where: { id: run.id },
        data: { status: PayrollRunStatus.POSTED, transactionId },
      });
    });

    /* Выплата части зарплаты наличными: Дт 533 — Кт 101.01 */
    const cashPay = sumNet.mul(0.25).toDecimalPlaces(2);
    await prisma.$transaction(async (tx) => {
      await postJournal(tx, {
        organizationId: org.id,
        date: periodEnd,
        reference: `${ref}-CASH`,
        description: "Выплата зарплаты наличными (часть фонда)",
        isFinal: true,
        lines: [
          { accountCode: PAYROLL_PAYABLE, debit: cashPay.toString(), credit: "0" },
          { accountCode: CASH_OP, debit: "0", credit: cashPay.toString() },
        ],
      });
    });
  }

  /* ---------- Инвойсы (продажи) ---------- */
  const customers = counterparties.filter((c) => c.role === CounterpartyRole.CUSTOMER);
  let invSeq = 1;
  const year = now.getUTCFullYear();

  type InvPlan = {
    status: InvoiceStatus;
    recognize: boolean;
    payRatio: number;
    bank: boolean;
    daysAgo: number;
  };

  const plans: InvPlan[] = [];
  for (let i = 0; i < 40; i++) {
    const roll = i % 7;
    if (roll === 0) plans.push({ status: InvoiceStatus.DRAFT, recognize: false, payRatio: 0, bank: false, daysAgo: rnd(0, 120) });
    else if (roll === 1)
      plans.push({ status: InvoiceStatus.SENT, recognize: true, payRatio: 0, bank: false, daysAgo: rnd(0, 120) });
    else if (roll === 2)
      plans.push({
        status: InvoiceStatus.SENT,
        recognize: true,
        payRatio: 1,
        bank: true,
        daysAgo: rnd(0, 90),
      });
    else if (roll === 3)
      plans.push({
        status: InvoiceStatus.SENT,
        recognize: true,
        payRatio: 1,
        bank: false,
        daysAgo: rnd(0, 90),
      });
    else if (roll === 4)
      plans.push({
        status: InvoiceStatus.PARTIALLY_PAID,
        recognize: true,
        payRatio: 0.5,
        bank: true,
        daysAgo: rnd(0, 90),
      });
    else if (roll === 5)
      plans.push({
        status: InvoiceStatus.SENT,
        recognize: true,
        payRatio: 0,
        bank: false,
        daysAgo: rnd(100, 130),
      });
    else plans.push({ status: InvoiceStatus.PAID, recognize: true, payRatio: 1, bank: true, daysAgo: rnd(0, 60) });
  }

  for (let i = 0; i < 40; i++) {
    const p = plans[i]!;
    const cp = customers[i % customers.length]!;
    const prod = products[i % products.length]!;
    const qty = new Decimal(rnd(1, 5));
    const pr = await prisma.product.findFirstOrThrow({ where: { id: prod.id } });
    const net = qty.mul(pr.price);
    const vatAmt = net.mul(pr.vatRate).div(100);
    const lineTotal = net.add(vatAmt);
    const total = lineTotal;
    const due = new Date(now);
    due.setUTCDate(due.getUTCDate() - p.daysAgo);
    const issue = new Date(due);
    issue.setUTCDate(issue.getUTCDate() - rnd(5, 20));

    const number = `INV-${year}-TIVI-${String(invSeq++).padStart(4, "0")}`;
    const debitAccount = p.bank ? MAIN_BANK : CASH_OP;

    const inv = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        number,
        status: InvoiceStatus.DRAFT,
        dueDate: due,
        counterpartyId: cp.id,
        debitAccountCode: debitAccount,
        totalAmount: total,
        currency: "AZN",
        revenueRecognized: false,
        paymentReceived: false,
        items: {
          create: [
            {
              organizationId: org.id,
              productId: prod.id,
              description: pr.name,
              quantity: qty,
              unitPrice: pr.price,
              vatRate: pr.vatRate,
              lineTotal,
            },
          ],
        },
      },
    });

    if (!p.recognize) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: p.status },
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await postJournal(tx, {
        organizationId: org.id,
        date: issue,
        reference: number,
        description: `Выручка по ${number}`,
        counterpartyId: cp.id,
        isFinal: true,
        lines: [
          { accountCode: RECEIVABLE, debit: total.toString(), credit: "0" },
          { accountCode: REVENUE, debit: "0", credit: total.toString() },
        ],
      });
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          revenueRecognized: true,
          recognizedAt: issue,
          status: InvoiceStatus.SENT,
          inventorySettled: true,
        },
      });
    });

    if (p.payRatio <= 0) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: p.status === InvoiceStatus.SENT ? InvoiceStatus.SENT : p.status },
      });
      continue;
    }

    const payAmt = total.mul(p.payRatio).toDecimalPlaces(2);
    const payDate = new Date(issue);
    payDate.setUTCDate(payDate.getUTCDate() + rnd(1, 14));

    await prisma.$transaction(async (tx) => {
      const tid = await postJournal(tx, {
        organizationId: org.id,
        date: payDate,
        reference: number,
        description: `Оплата ${number}`,
        counterpartyId: cp.id,
        isFinal: true,
        lines: [
          { accountCode: debitAccount, debit: payAmt.toString(), credit: "0" },
          { accountCode: RECEIVABLE, debit: "0", credit: payAmt.toString() },
        ],
      });
      await tx.invoicePayment.create({
        data: {
          organizationId: org.id,
          invoiceId: inv.id,
          amount: payAmt,
          date: payDate,
          transactionId: tid,
        },
      });
    });

    const paidSum =
      p.payRatio >= 1
        ? total
        : payAmt;
    let nextStatus: InvoiceStatus = InvoiceStatus.SENT;
    if (paidSum.gte(total)) nextStatus = InvoiceStatus.PAID;
    else if (paidSum.gt(0)) nextStatus = InvoiceStatus.PARTIALLY_PAID;

    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        status: nextStatus,
        paymentReceived: paidSum.gte(total),
      },
    });
  }

  /* ---------- Банковская выписка (фон) + строки для демо ---------- */
  const stmt = await prisma.bankStatement.create({
    data: {
      organizationId: org.id,
      date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5, 12, 0, 0, 0)),
      totalAmount: new Decimal(50000),
      bankName: "Kapital Bank",
      channel: "BANK",
    },
  });
  for (let i = 0; i < 8; i++) {
    await prisma.bankStatementLine.create({
      data: {
        organizationId: org.id,
        bankStatementId: stmt.id,
        amount: new Decimal(rnd(500, 8000)),
        type: "INFLOW",
        description: `Поступление по договору ${i + 1}`,
        counterpartyTaxId: randomDigits(10),
        valueDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3 + i, 12, 0, 0, 0)),
        origin: "FILE_IMPORT",
      },
    });
  }

  /* ---------- Kassa: KMO (income), KXO (accountable), advance report ---------- */
  const y = now.getUTCFullYear();
  const pkoNum = `KMO-${y}-00001`;
  const rkoNum = `KXO-${y}-00001`;

  const emp244 = employees.find((e) => e.accountable244 === "244.01");
  if (emp244) {
    await prisma.$transaction(async (tx) => {
      const c = await tx.cashOrder.create({
        data: {
          organizationId: org.id,
          orderNumber: pkoNum,
          date: new Date(Date.UTC(y, now.getUTCMonth(), 8, 12, 0, 0, 0)),
          kind: CashOrderKind.KMO,
          status: CashOrderStatus.DRAFT,
          pkoSubtype: CashOrderPkoSubtype.INCOME_FROM_CUSTOMER,
          amount: new Decimal(1200),
          purpose: "Приход за съёмочный день (клиент)",
          cashAccountCode: CASH_OP,
          offsetAccountCode: REVENUE,
          counterpartyId: customers[0]!.id,
        },
      });
      const tid = await postJournal(tx, {
        organizationId: org.id,
        date: c.date,
        reference: pkoNum,
        description: c.purpose,
        isFinal: true,
        lines: [
          { accountCode: CASH_OP, debit: "1200", credit: "0" },
          { accountCode: REVENUE, debit: "0", credit: "1200" },
        ],
      });
      await tx.cashOrder.update({
        where: { id: c.id },
        data: { status: CashOrderStatus.POSTED, postedTransactionId: tid },
      });
    });

    await prisma.$transaction(async (tx) => {
      const c = await tx.cashOrder.create({
        data: {
          organizationId: org.id,
          orderNumber: rkoNum,
          date: new Date(Date.UTC(y, now.getUTCMonth(), 9, 12, 0, 0, 0)),
          kind: CashOrderKind.KXO,
          status: CashOrderStatus.DRAFT,
          rkoSubtype: CashOrderRkoSubtype.ACCOUNTABLE_ISSUE,
          amount: new Decimal(500),
          purpose: "Выдача подотчёта на реквизит",
          cashAccountCode: CASH_OP,
          employeeId: emp244.id,
        },
      });
      const tid = await postJournal(tx, {
        organizationId: org.id,
        date: c.date,
        reference: rkoNum,
        description: c.purpose,
        isFinal: true,
        lines: [
          { accountCode: "244.01", debit: "500", credit: "0" },
          { accountCode: CASH_OP, debit: "0", credit: "500" },
        ],
      });
      await tx.cashOrder.update({
        where: { id: c.id },
        data: { status: CashOrderStatus.POSTED, postedTransactionId: tid },
      });
    });

    const ar = await prisma.advanceReport.create({
      data: {
        organizationId: org.id,
        employeeId: emp244.id,
        reportDate: new Date(Date.UTC(y, now.getUTCMonth(), 12, 12, 0, 0, 0)),
        expenseLines: [
          { amount: 320, description: "Реквизит, расходники" },
          { amount: 150, description: "Питание на съёмке" },
        ] as unknown as Prisma.InputJsonValue,
        totalDeclared: new Decimal(470),
        purpose: "Закрытие подотчёта",
        status: AdvanceReportStatus.DRAFT,
      },
    });
    await prisma.$transaction(async (tx) => {
      const tid = await postJournal(tx, {
        organizationId: org.id,
        date: ar.reportDate,
        reference: `AVANS-${ar.id.slice(0, 8)}`,
        description: "Авансовый отчёт (мелкие расходы)",
        isFinal: true,
        lines: [
          { accountCode: MISC_EXP, debit: "470", credit: "0" },
          { accountCode: "244.01", debit: "0", credit: "470" },
        ],
      });
      await tx.advanceReport.update({
        where: { id: ar.id },
        data: { status: AdvanceReportStatus.POSTED, transactionId: tid },
      });
    });
  }

  const prevSettings =
    org.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
      ? (org.settings as Record<string, unknown>)
      : {};
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      settings: {
        ...prevSettings,
        [SEED_MARKER]: { at: new Date().toISOString(), version: 1 },
      },
    },
  });

  console.info(
    `[seed-tivi] Готово: контрагенты, продукты, HR, табель (${months.length} мес.), зарплата, ~40 инвойсов, банк/касса. Организация ${org.id}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closePrismaPool();
  });

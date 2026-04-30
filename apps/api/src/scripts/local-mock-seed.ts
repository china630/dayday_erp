import "reflect-metadata";
import * as bcrypt from "bcrypt";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  AccountType,
  CashOrderKind,
  CashOrderPkoSubtype,
  CashOrderRkoSubtype,
  CashOrderStatus,
  CoaTemplateProfile,
  CounterpartyKind,
  CounterpartyRole,
  InvoiceStatus,
  LedgerType,
  Prisma,
  UserRole,
  provisionNasAccountsForOrganization,
} from "@dayday/database";
import { AccountingService } from "../accounting/accounting.service";
import { IfrsAutoMappingService } from "../accounting/ifrs-auto-mapping.service";
import { apiEnvFilePaths } from "../load-env-paths";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";

const Decimal = Prisma.Decimal;
const OWNER_EMAIL = "shirinov.chingiz@gmail.com";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: (() => {
        const files = apiEnvFilePaths();
        return files.length ? files : [".env"];
      })(),
    }),
    PrismaModule,
  ],
  providers: [IfrsAutoMappingService, AccountingService],
})
class LocalMockSeedModule {}

type OrgSeedConfig = {
  name: string;
  taxId: string;
  legalAddress: string;
  phone: string;
  directorName: string;
  departments: string[];
  positions: Array<{ departmentName: string; name: string; minSalary: number; maxSalary: number }>;
  employees: Array<{
    finCode: string;
    firstName: string;
    lastName: string;
    patronymic?: string;
    salary: number;
    positionName: string;
    hireDate: Date;
  }>;
  counterparties: Array<{
    name: string;
    taxId: string;
    role: CounterpartyRole;
    kind: CounterpartyKind;
    email?: string;
  }>;
  products: Array<{ name: string; sku: string; price: number }>;
};

async function createOrGetOwner(prisma: PrismaService) {
  const existing = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
  });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash("DaydayLocal#2026", 10);
  return prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      passwordHash,
      firstName: "Chingiz",
      lastName: "Shirinov",
      fullName: "Chingiz Shirinov",
    },
  });
}

async function recreateOrganization(
  prisma: PrismaService,
  accounting: AccountingService,
  ownerId: string,
  config: OrgSeedConfig,
) {
  await prisma.organization.deleteMany({
    where: { taxId: config.taxId },
  });

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: config.name,
        taxId: config.taxId,
        currency: "AZN",
        legalAddress: config.legalAddress,
        phone: config.phone,
        directorName: config.directorName,
        ownerId,
        coaTemplateProfile: CoaTemplateProfile.COMMERCIAL_FULL,
      },
    });

    await tx.organizationMembership.create({
      data: {
        userId: ownerId,
        organizationId: organization.id,
        role: UserRole.OWNER,
      },
    });

    await provisionNasAccountsForOrganization(
      tx,
      organization.id,
      CoaTemplateProfile.COMMERCIAL_FULL,
    );
    let accountableAccount = await tx.account.findFirst({
      where: {
        organizationId: organization.id,
        ledgerType: LedgerType.NAS,
        OR: [{ code: "244" }, { code: { startsWith: "244." } }],
      },
      orderBy: { code: "asc" },
      select: { code: true },
    });
    if (!accountableAccount) {
      const parent24 = await tx.account.findFirst({
        where: {
          organizationId: organization.id,
          ledgerType: LedgerType.NAS,
          code: "24",
        },
        select: { id: true },
      });
      accountableAccount = await tx.account.create({
        data: {
          organizationId: organization.id,
          ledgerType: LedgerType.NAS,
          code: "244",
          nameAz: "Təhtəlhesab şəxslərlə hesablaşmalar",
          nameRu: "Расчеты с подотчетными лицами",
          nameEn: "Settlements with accountable persons",
          type: AccountType.ASSET,
          parentId: parent24?.id ?? null,
        },
        select: { code: true },
      });
    }
    const accountableAccountCode = accountableAccount.code;

    const departmentMap = new Map<string, string>();
    for (const name of config.departments) {
      const dep = await tx.department.create({
        data: { organizationId: organization.id, name },
      });
      departmentMap.set(name, dep.id);
    }

    const positionMap = new Map<string, string>();
    for (const pos of config.positions) {
      const departmentId = departmentMap.get(pos.departmentName);
      if (!departmentId) throw new Error(`Missing department: ${pos.departmentName}`);
      const created = await tx.jobPosition.create({
        data: {
          departmentId,
          name: pos.name,
          totalSlots: 5,
          minSalary: new Decimal(pos.minSalary),
          maxSalary: new Decimal(pos.maxSalary),
        },
      });
      positionMap.set(pos.name, created.id);
    }

    const employeeMap = new Map<string, string>();
    for (const emp of config.employees) {
      const positionId = positionMap.get(emp.positionName);
      if (!positionId) throw new Error(`Missing position: ${emp.positionName}`);
      const createdEmployee = await tx.employee.create({
        data: {
          organizationId: organization.id,
          finCode: emp.finCode,
          firstName: emp.firstName,
          lastName: emp.lastName,
          patronymic: emp.patronymic ?? null,
          startDate: emp.hireDate,
          hireDate: emp.hireDate,
          salary: new Decimal(emp.salary),
          positionId,
          accountableAccountCode244:
            config.taxId === "3700543341" && emp.positionName === "Content Manager"
              ? accountableAccountCode
              : null,
        },
      });
      employeeMap.set(`${emp.firstName} ${emp.lastName}`, createdEmployee.id);
      if (!employeeMap.has(emp.positionName)) {
        employeeMap.set(emp.positionName, createdEmployee.id);
      }
    }

    const counterpartyMap = new Map<string, string>();
    for (const cp of config.counterparties) {
      const created = await tx.counterparty.create({
        data: {
          organizationId: organization.id,
          name: cp.name,
          taxId: cp.taxId,
          role: cp.role,
          kind: cp.kind,
          email: cp.email ?? null,
        },
      });
      counterpartyMap.set(cp.name, created.id);
    }

    const productMap = new Map<string, string>();
    for (const p of config.products) {
      const created = await tx.product.create({
        data: {
          organizationId: organization.id,
          name: p.name,
          sku: p.sku,
          price: new Decimal(p.price),
          vatRate: new Decimal(0),
          isService: true,
        },
      });
      productMap.set(p.name, created.id);
    }

    const cfItems = await Promise.all([
      tx.cashFlowItem.create({
        data: {
          organizationId: organization.id,
          code: "CF-OPS",
          name: "Операционная деятельность",
        },
      }),
      tx.cashFlowItem.create({
        data: {
          organizationId: organization.id,
          code: "CF-SUP",
          name: "Оплата поставщикам",
        },
      }),
      tx.cashFlowItem.create({
        data: {
          organizationId: organization.id,
          code: "CF-OTH",
          name: "Прочее",
        },
      }),
    ]);
    const cashFlowIdByCode = new Map(cfItems.map((item) => [item.code, item.id]));
    const cashDesk = await tx.cashDesk.create({
      data: {
        organizationId: organization.id,
        name: "Baş Kassa",
        currencies: ["AZN"],
        isActive: true,
      },
    });
    const cashOrderSeq = new Map<string, number>();
    const nextCashOrderNumber = (kind: CashOrderKind) => {
      const prefix = kind === CashOrderKind.KMO ? "KMO" : "KXO";
      return (date: Date) => {
        const year = date.getUTCFullYear();
        const key = `${prefix}-${year}`;
        const current = cashOrderSeq.get(key) ?? 1;
        cashOrderSeq.set(key, current + 1);
        return `${prefix}-${year}-${String(current).padStart(5, "0")}`;
      };
    };
    const nextKmo = nextCashOrderNumber(CashOrderKind.KMO);
    const nextKxo = nextCashOrderNumber(CashOrderKind.KXO);
    const getCashOrderNumber = (kind: CashOrderKind, date: Date) => {
      if (kind === CashOrderKind.KMO) {
        return nextKmo(date);
      }
      return nextKxo(date);
    };
    const randomInt = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;
    const randomAmount = (min: number, max: number, step = 50) =>
      randomInt(min / step, max / step) * step;
    const monthStartDates: Date[] = [];
    const now = new Date();
    const targetYear = now.getUTCFullYear();
    for (let month = 0; month < 5; month += 1) {
      monthStartDates.push(new Date(Date.UTC(targetYear, month, 1)));
    }
    const randomDateInMonth = (monthStart: Date, minDay = 3, maxDay = 26) => {
      const year = monthStart.getUTCFullYear();
      const month = monthStart.getUTCMonth();
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const safeMin = Math.min(minDay, daysInMonth);
      const safeMax = Math.min(Math.max(maxDay, safeMin), daysInMonth);
      const day = randomInt(safeMin, safeMax);
      return new Date(Date.UTC(year, month, day));
    };
    let invoiceSeq = 1;
    const nextInvoiceNumber = (date: Date) => {
      const year = date.getUTCFullYear();
      const number = `INV-${year}-${String(invoiceSeq).padStart(4, "0")}`;
      invoiceSeq += 1;
      return number;
    };
    const createPostedCashOrder = async (params: {
      kind: CashOrderKind;
      date: Date;
      amount: number;
      purpose: string;
      cashFlowCode: "CF-OPS" | "CF-SUP" | "CF-OTH";
      pkoSubtype?: CashOrderPkoSubtype;
      rkoSubtype?: CashOrderRkoSubtype;
      offsetAccountCode: string;
      counterpartyId?: string | null;
      employeeId?: string | null;
      journalLines: Array<{ accountCode: string; debit: string; credit: string }>;
    }) => {
      const cashFlowItemId = cashFlowIdByCode.get(params.cashFlowCode);
      if (!cashFlowItemId) throw new Error(`Missing cash flow item: ${params.cashFlowCode}`);
      const orderNumber = getCashOrderNumber(params.kind, params.date);
      const journal = await accounting.postJournalInTransaction(tx, {
        organizationId: organization.id,
        date: params.date,
        reference: orderNumber,
        description: params.purpose,
        isFinal: true,
        counterpartyId: params.counterpartyId ?? undefined,
        lines: params.journalLines,
      });
      await tx.cashOrder.create({
        data: {
          organizationId: organization.id,
          orderNumber,
          date: params.date,
          kind: params.kind,
          status: CashOrderStatus.POSTED,
          pkoSubtype: params.pkoSubtype ?? null,
          rkoSubtype: params.rkoSubtype ?? null,
          currency: "AZN",
          amount: new Decimal(params.amount),
          purpose: params.purpose,
          cashAccountCode: "101",
          offsetAccountCode: params.offsetAccountCode,
          counterpartyId: params.counterpartyId ?? null,
          employeeId: params.employeeId ?? null,
          cashFlowItemId,
          cashDeskId: cashDesk.id,
          postedTransactionId: journal.transactionId,
        },
      });
    };

    const createInvoice = async (params: {
      counterpartyName: string;
      productName: string;
      amount: number;
      issueDate: Date;
      paid: boolean;
    }) => {
      const counterpartyId = counterpartyMap.get(params.counterpartyName);
      const productId = productMap.get(params.productName);
      if (!counterpartyId) throw new Error(`Missing counterparty: ${params.counterpartyName}`);
      if (!productId) throw new Error(`Missing product: ${params.productName}`);
      const number = nextInvoiceNumber(params.issueDate);

      const invoice = await tx.invoice.create({
        data: {
          organizationId: organization.id,
          number,
          status: params.paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
          dueDate: params.issueDate,
          counterpartyId,
          debitAccountCode: "221",
          totalAmount: new Decimal(params.amount),
          paidAmount: new Decimal(params.paid ? params.amount : 0),
          currency: "AZN",
          revenueRecognized: true,
          paymentReceived: params.paid,
          recognizedAt: params.issueDate,
        },
      });

      await tx.invoiceItem.create({
        data: {
          organizationId: organization.id,
          invoiceId: invoice.id,
          productId,
          description: params.productName,
          quantity: new Decimal(1),
          unitPrice: new Decimal(params.amount),
          vatRate: new Decimal(0),
          lineTotal: new Decimal(params.amount),
        },
      });

      await accounting.postJournalInTransaction(tx, {
        organizationId: organization.id,
        date: params.issueDate,
        reference: invoice.number,
        description: `Revenue recognition for ${invoice.number}`,
        isFinal: true,
        counterpartyId,
        lines: [
          { accountCode: "211", debit: String(params.amount), credit: "0" },
          { accountCode: "601", debit: "0", credit: String(params.amount) },
        ],
      });

      if (params.paid) {
        const paymentDate = randomDateInMonth(
          new Date(Date.UTC(params.issueDate.getUTCFullYear(), params.issueDate.getUTCMonth(), 1)),
          params.issueDate.getUTCDate(),
          27,
        );
        const paymentTx = await accounting.postJournalInTransaction(tx, {
          organizationId: organization.id,
          date: paymentDate,
          reference: `PAY-${invoice.number}`,
          description: `Invoice payment ${invoice.number}`,
          isFinal: true,
          counterpartyId,
          lines: [
            { accountCode: "221", debit: String(params.amount), credit: "0" },
            { accountCode: "211", debit: "0", credit: String(params.amount) },
          ],
        });
        await tx.invoicePayment.create({
          data: {
            organizationId: organization.id,
            invoiceId: invoice.id,
            amount: new Decimal(params.amount),
            date: paymentDate,
            transactionId: paymentTx.transactionId,
          },
        });
        await tx.paymentAllocation.create({
          data: {
            organizationId: organization.id,
            invoiceId: invoice.id,
            transactionId: paymentTx.transactionId,
            allocatedAmount: new Decimal(params.amount),
            date: paymentDate,
          },
        });
      }

      return { invoiceId: invoice.id, counterpartyId, number };
    };

    if (config.taxId === "3700543341") {
      await accounting.postJournalInTransaction(tx, {
        organizationId: organization.id,
        date: new Date(Date.UTC(now.getUTCFullYear(), 0, 10)),
        reference: "CAPITAL-TIVI-MEDIA",
        description: "Charter capital contribution (bank + cash)",
        isFinal: true,
        lines: [
          { accountCode: "221", debit: "10000", credit: 0 },
          { accountCode: "101", debit: "10000", credit: 0 },
          { accountCode: "301", debit: 0, credit: "20000" },
        ],
      });

      for (const monthStart of monthStartDates) {
        const cashWithdrawal = randomAmount(2000, 3000, 50);
        const withdrawalDate = randomDateInMonth(monthStart, 2, 8);
        await createPostedCashOrder({
          kind: CashOrderKind.KMO,
          date: withdrawalDate,
          amount: cashWithdrawal,
          purpose: "Cash withdrawal from bank for monthly operations",
          cashFlowCode: "CF-OPS",
          pkoSubtype: CashOrderPkoSubtype.WITHDRAWAL_FROM_BANK,
          offsetAccountCode: "221",
          journalLines: [
            { accountCode: "101", debit: String(cashWithdrawal), credit: "0" },
            { accountCode: "221", debit: "0", credit: String(cashWithdrawal) },
          ],
        });

        const invoiceCount = randomInt(8, 10);
        for (let i = 0; i < invoiceCount; i += 1) {
          const isYoutube = i % 2 === 0;
          const amount = randomAmount(800, 5000, 50);
          await createInvoice({
            counterpartyName: isYoutube ? "Xəzər TV" : "Miri Yusif (IP)",
            productName: isYoutube
              ? "YouTube Monetization Service"
              : "Facebook Ad Placement",
            amount,
            issueDate: randomDateInMonth(monthStart, 2, 25),
            paid: Math.random() < 0.7,
          });
        }

        const expenseCount = randomInt(5, 8);
        for (let i = 0; i < expenseCount; i += 1) {
          const amount = randomAmount(500, 1200, 25);
          const date = randomDateInMonth(monthStart, 3, 27);
          const bankExpense = i % 2 === 0;
          if (bankExpense) {
            await accounting.postJournalInTransaction(tx, {
              organizationId: organization.id,
              date,
              reference: `EXP-MEDIA-${date.toISOString().slice(0, 10)}-${i + 1}`,
              description: i % 3 === 0 ? "Marketing and promotion costs" : "Server rent and software subscriptions",
              isFinal: true,
              counterpartyId:
                i % 3 === 0
                  ? counterpartyMap.get("Meta Platforms") ?? null
                  : counterpartyMap.get("Google Ireland Ltd") ?? null,
              lines: [
                { accountCode: "721", debit: String(amount), credit: "0" },
                { accountCode: "221", debit: "0", credit: String(amount) },
              ],
            });
          } else {
            await createPostedCashOrder({
              kind: CashOrderKind.KXO,
              date,
              amount,
              purpose: "Operational cash expense (internet/office/marketing)",
              cashFlowCode: "CF-OTH",
              rkoSubtype: CashOrderRkoSubtype.OTHER,
              offsetAccountCode: "721",
              journalLines: [
                { accountCode: "721", debit: String(amount), credit: "0" },
                { accountCode: "101", debit: "0", credit: String(amount) },
              ],
            });
          }
        }

        const advanceAmount = randomAmount(100, 300, 10);
        await createPostedCashOrder({
          kind: CashOrderKind.KXO,
          date: randomDateInMonth(monthStart, 8, 16),
          amount: advanceAmount,
          purpose: "Cash advance for urgent filming expenses",
          cashFlowCode: "CF-OTH",
          rkoSubtype: CashOrderRkoSubtype.ACCOUNTABLE_ISSUE,
          offsetAccountCode: accountableAccountCode,
          employeeId: employeeMap.get("Content Manager") ?? null,
          journalLines: [
            { accountCode: accountableAccountCode, debit: String(advanceAmount), credit: "0" },
            { accountCode: "101", debit: "0", credit: String(advanceAmount) },
          ],
        });

        const returnAmount = Math.max(50, Math.floor(advanceAmount * 0.5));
        await createPostedCashOrder({
          kind: CashOrderKind.KMO,
          date: randomDateInMonth(monthStart, 17, 26),
          amount: returnAmount,
          purpose: "Return of unused accountable cash",
          cashFlowCode: "CF-OPS",
          pkoSubtype: CashOrderPkoSubtype.RETURN_FROM_ACCOUNTABLE,
          offsetAccountCode: accountableAccountCode,
          employeeId: employeeMap.get("Content Manager") ?? null,
          journalLines: [
            { accountCode: "101", debit: String(returnAmount), credit: "0" },
            { accountCode: accountableAccountCode, debit: "0", credit: String(returnAmount) },
          ],
        });
      }
    }

    if (config.taxId === "3701329841") {
      await accounting.postJournalInTransaction(tx, {
        organizationId: organization.id,
        date: new Date(Date.UTC(now.getUTCFullYear(), 0, 11)),
        reference: "CAPITAL-TIVI-SPORT",
        description: "Charter capital contribution (bank + cash)",
        isFinal: true,
        lines: [
          { accountCode: "221", debit: "25000", credit: 0 },
          { accountCode: "101", debit: "25000", credit: 0 },
          { accountCode: "301", debit: 0, credit: "50000" },
        ],
      });

      for (const monthStart of monthStartDates) {
        const cashWithdrawal = randomAmount(2000, 3000, 50);
        const withdrawalDate = randomDateInMonth(monthStart, 2, 9);
        await createPostedCashOrder({
          kind: CashOrderKind.KMO,
          date: withdrawalDate,
          amount: cashWithdrawal,
          purpose: "Cash withdrawal from bank for tournament operations",
          cashFlowCode: "CF-OPS",
          pkoSubtype: CashOrderPkoSubtype.WITHDRAWAL_FROM_BANK,
          offsetAccountCode: "221",
          journalLines: [
            { accountCode: "101", debit: String(cashWithdrawal), credit: "0" },
            { accountCode: "221", debit: "0", credit: String(cashWithdrawal) },
          ],
        });

        const month = monthStart.getUTCMonth();
        const invoiceCount = randomInt(8, 10);
        for (let i = 0; i < invoiceCount; i += 1) {
          let amount = randomAmount(1200, 5200, 100);
          let counterpartyName = "Baku Tennis Academy";
          let productName = "Организация теннисного турнира Baku Open";
          if (month === 0 && i === 0) {
            amount = 15000;
            counterpartyName = "Спонсор - Kapital Bank";
            productName = "Спонсорский пакет (Platinum)";
          } else if (month >= 1 && month <= 3) {
            counterpartyName = i % 2 === 0 ? "Baku Tennis Academy" : "Sabah FC";
            productName =
              i % 2 === 0
                ? "Организация теннисного турнира Baku Open"
                : "Организация юношеского турнира по футболу";
            amount = randomAmount(3000, 5000, 100);
          } else if (month === 4 && i === 0) {
            counterpartyName = "Sabah FC";
            productName = "Организация юношеского турнира по футболу";
            amount = 8000;
          } else if (i % 3 === 0) {
            counterpartyName = "Спонсор - Kapital Bank";
            productName = "Спонсорский пакет (Platinum)";
            amount = randomAmount(6000, 12000, 100);
          }
          await createInvoice({
            counterpartyName,
            productName,
            amount,
            issueDate: randomDateInMonth(monthStart, 2, 24),
            paid: Math.random() < 0.75,
          });
        }

        const expenseCount = randomInt(5, 8);
        for (let i = 0; i < expenseCount; i += 1) {
          const amount = randomAmount(1000, 4000, 50);
          const date = randomDateInMonth(monthStart, 5, 28);
          if (i % 2 === 0) {
            await accounting.postJournalInTransaction(tx, {
              organizationId: organization.id,
              date,
              reference: `EXP-SPORT-${date.toISOString().slice(0, 10)}-${i + 1}`,
              description: "Field rental and sports inventory purchase",
              isFinal: true,
              counterpartyId:
                i % 3 === 0
                  ? counterpartyMap.get("Baku Olympic Stadium") ?? null
                  : counterpartyMap.get("Sport Equipment MMC") ?? null,
              lines: [
                { accountCode: "721", debit: String(amount), credit: "0" },
                { accountCode: "221", debit: "0", credit: String(amount) },
              ],
            });
          } else {
            await createPostedCashOrder({
              kind: CashOrderKind.KXO,
              date,
              amount,
              purpose: "Stadium urgent purchases (water, first aid, logistics)",
              cashFlowCode: "CF-OTH",
              rkoSubtype: CashOrderRkoSubtype.OTHER,
              offsetAccountCode: "721",
              journalLines: [
                { accountCode: "721", debit: String(amount), credit: "0" },
                { accountCode: "101", debit: "0", credit: String(amount) },
              ],
            });
          }
        }

        const cashIn = randomAmount(700, 2200, 50);
        await createPostedCashOrder({
          kind: CashOrderKind.KMO,
          date: randomDateInMonth(monthStart, 11, 24),
          amount: cashIn,
          purpose: "Cash participation fees for amateur tournaments",
          cashFlowCode: "CF-OPS",
          pkoSubtype: CashOrderPkoSubtype.INCOME_FROM_CUSTOMER,
          offsetAccountCode: "601",
          counterpartyId: counterpartyMap.get("Baku Tennis Academy") ?? null,
          journalLines: [
            { accountCode: "101", debit: String(cashIn), credit: "0" },
            { accountCode: "601", debit: "0", credit: String(cashIn) },
          ],
        });

        const bankDeposit = Math.max(500, Math.floor(cashIn * 0.6));
        await createPostedCashOrder({
          kind: CashOrderKind.KXO,
          date: randomDateInMonth(monthStart, 18, 28),
          amount: bankDeposit,
          purpose: "Cash collection deposit to bank account",
          cashFlowCode: "CF-SUP",
          rkoSubtype: CashOrderRkoSubtype.BANK_DEPOSIT,
          offsetAccountCode: "221",
          journalLines: [
            { accountCode: "221", debit: String(bankDeposit), credit: "0" },
            { accountCode: "101", debit: "0", credit: String(bankDeposit) },
          ],
        });
      }
    }
  });
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(LocalMockSeedModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const prisma = app.get(PrismaService);
    const accounting = app.get(AccountingService);

    const owner = await createOrGetOwner(prisma);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
    const oneYearAgo = new Date();
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);

    await recreateOrganization(prisma, accounting, owner.id, {
      name: "TiVi Media MMC",
      taxId: "3700543341",
      legalAddress: "Baku, Yasamal district, Shikhov street 14",
      phone: "+994503334455",
      directorName: "Chingiz Shirinov",
      departments: ["Digital Distribution", "Copyright & Legal"],
      positions: [
        {
          departmentName: "Digital Distribution",
          name: "Content Manager",
          minSalary: 2000,
          maxSalary: 3500,
        },
        {
          departmentName: "Copyright & Legal",
          name: "Legal Counsel",
          minSalary: 2500,
          maxSalary: 4200,
        },
      ],
      employees: [
        {
          finCode: "TVM1001",
          firstName: "Aysel",
          lastName: "Mammadova",
          patronymic: "Elchin qizi",
          salary: 2800,
          positionName: "Content Manager",
          hireDate: sixMonthsAgo,
        },
        {
          finCode: "TVM1002",
          firstName: "Rauf",
          lastName: "Aliyev",
          patronymic: "Asif oglu",
          salary: 3600,
          positionName: "Legal Counsel",
          hireDate: sixMonthsAgo,
        },
      ],
      counterparties: [
        {
          name: "Xəzər TV",
          taxId: "1403552211",
          role: CounterpartyRole.CUSTOMER,
          kind: CounterpartyKind.LEGAL_ENTITY,
          email: "finance@xezer.tv",
        },
        {
          name: "Miri Yusif (IP)",
          taxId: "0908876543",
          role: CounterpartyRole.CUSTOMER,
          kind: CounterpartyKind.INDIVIDUAL,
        },
        {
          name: "Google Ireland Ltd",
          taxId: "9901000001",
          role: CounterpartyRole.SUPPLIER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
        {
          name: "Meta Platforms",
          taxId: "9901000002",
          role: CounterpartyRole.SUPPLIER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
      ],
      products: [
        {
          name: "YouTube Monetization Service",
          sku: "TVM-SVC-001",
          price: 4500,
        },
        {
          name: "Royalty Collection & Copyright Protection",
          sku: "TVM-SVC-002",
          price: 1200,
        },
        {
          name: "Facebook Ad Placement",
          sku: "TVM-SVC-003",
          price: 2200,
        },
      ],
    });

    await recreateOrganization(prisma, accounting, owner.id, {
      name: "TiVi Sport MMC",
      taxId: "3701329841",
      legalAddress: "Baku, Narimanov district, Ataturk avenue 88",
      phone: "+994552224466",
      directorName: "Chingiz Shirinov",
      departments: ["Event Management", "Coaching Staff"],
      positions: [
        {
          departmentName: "Event Management",
          name: "Event Coordinator",
          minSalary: 1800,
          maxSalary: 3200,
        },
        {
          departmentName: "Coaching Staff",
          name: "Head Coach",
          minSalary: 3000,
          maxSalary: 5000,
        },
      ],
      employees: [
        {
          finCode: "TVS2001",
          firstName: "Turan",
          lastName: "Hasanov",
          patronymic: "Rashad oglu",
          salary: 2900,
          positionName: "Event Coordinator",
          hireDate: oneYearAgo,
        },
        {
          finCode: "TVS2002",
          firstName: "Nigar",
          lastName: "Quliyeva",
          patronymic: "Samir qizi",
          salary: 3300,
          positionName: "Event Coordinator",
          hireDate: oneYearAgo,
        },
        {
          finCode: "TVS2003",
          firstName: "Kamran",
          lastName: "Rahimov",
          patronymic: "Adil oglu",
          salary: 4600,
          positionName: "Head Coach",
          hireDate: oneYearAgo,
        },
      ],
      counterparties: [
        {
          name: "Baku Tennis Academy",
          taxId: "1506677001",
          role: CounterpartyRole.CUSTOMER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
        {
          name: "Sabah FC",
          taxId: "1309988123",
          role: CounterpartyRole.CUSTOMER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
        {
          name: "Спонсор - Kapital Bank",
          taxId: "9902334411",
          role: CounterpartyRole.CUSTOMER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
        {
          name: "Sport Equipment MMC",
          taxId: "1705566123",
          role: CounterpartyRole.SUPPLIER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
        {
          name: "Baku Olympic Stadium",
          taxId: "1203344556",
          role: CounterpartyRole.SUPPLIER,
          kind: CounterpartyKind.LEGAL_ENTITY,
        },
      ],
      products: [
        {
          name: "Организация теннисного турнира Baku Open",
          sku: "TVS-SVC-001",
          price: 12000,
        },
        {
          name: "Организация юношеского турнира по футболу",
          sku: "TVS-SVC-002",
          price: 8000,
        },
        {
          name: "Спонсорский пакет (Platinum)",
          sku: "TVS-SVC-003",
          price: 15000,
        },
        {
          name: "Аренда спортивного инвентаря",
          sku: "TVS-SVC-004",
          price: 2500,
        },
      ],
    });

    const organizations = await prisma.organization.findMany({
      where: { taxId: { in: ["3700543341", "3701329841"] } },
      select: { id: true, name: true, taxId: true },
    });
    for (const org of organizations) {
      const cashRows = await prisma.journalEntry.findMany({
        where: {
          organizationId: org.id,
          ledgerType: LedgerType.NAS,
          account: { code: { startsWith: "101" } },
        },
        select: { debit: true, credit: true },
      });
      const net = cashRows.reduce(
        (acc, row) => acc.add(row.debit).sub(row.credit),
        new Decimal(0),
      );
      if (net.lt(0)) {
        throw new Error(
          `Cash balance is negative for ${org.name} (${org.taxId}): ${net.toFixed(2)} AZN`,
        );
      }
      console.log(`Cash balance check OK for ${org.name}: ${net.toFixed(2)} AZN`);
    }

    // Schema has statuses DRAFT/SENT/PAID; SENT is used as "issued but unpaid".
    console.log("Local mock seed completed successfully.");
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error("Local mock seed failed:", err);
  process.exit(1);
});

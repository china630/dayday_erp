import { Logger } from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { InvoiceStatus, LedgerType } from "@dayday/database";
import { AccountingService } from "../../src/accounting/accounting.service";
import { NettingService } from "../../src/accounting/netting.service";
import {
  PAYABLE_SUPPLIERS_ACCOUNT_CODE,
  RECEIVABLE_ACCOUNT_CODE,
} from "../../src/ledger.constants";
import type { PrismaService } from "../../src/prisma/prisma.service";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

describe("NettingService.createNetting (взаимозачёт)", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const cpId = "00000000-0000-0000-0000-0000000000c1";
  const invId = "00000000-0000-0000-0000-0000000000d1";

  it("проводка Дт 531 / Кт 211, распределение оплат, инвойс PAID", async () => {
    const journalParams: Array<{
      lines: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
      counterpartyId?: string | null;
    }> = [];

    const accounting = {
      postJournalInTransaction: jest.fn(
        async (
          _tx: unknown,
          params: {
            lines: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
            counterpartyId?: string | null;
          },
        ) => {
          journalParams.push({
            lines: params.lines,
            counterpartyId: params.counterpartyId,
          });
          return { transactionId: "txn-net-1" };
        },
      ),
    } as unknown as AccountingService;

    const invoiceRow = {
      id: invId,
      totalAmount: new Decimal(100),
      status: InvoiceStatus.SENT,
      revenueRecognized: true,
      dueDate: new Date(),
      payments: [] as { amount: Decimal }[],
    };

    const snapshotInvoices = () => [
      {
        ...invoiceRow,
        payments: invoiceRow.payments.map((p) => ({ amount: p.amount })),
      },
    ];

    const tx = {
      invoice: {
        findMany: jest.fn(async () => snapshotInvoices()),
        findFirstOrThrow: jest.fn(async () => ({
          id: invoiceRow.id,
          totalAmount: invoiceRow.totalAmount,
          status: invoiceRow.status,
          payments: invoiceRow.payments.map((p) => ({ amount: p.amount })),
        })),
        update: jest.fn().mockResolvedValue({}),
      },
      invoicePayment: {
        create: jest.fn(
          async ({
            data,
          }: {
            data: { amount: Decimal };
          }) => {
            invoiceRow.payments.push({ amount: data.amount });
          },
        ),
      },
    };

    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      counterparty: {
        findFirst: jest.fn().mockResolvedValue({ id: cpId, name: "Test CP" }),
      },
      invoice: {
        findMany: jest.fn(async () => snapshotInvoices()),
      },
      account: {
        findFirst: jest.fn(
          async ({
            where: { code },
          }: {
            where: { code: string };
          }) => {
            if (code === RECEIVABLE_ACCOUNT_CODE) return { id: "acc-211" };
            if (code === PAYABLE_SUPPLIERS_ACCOUNT_CODE) return { id: "acc-531" };
            return null;
          },
        ),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([
          { debit: new Decimal(0), credit: new Decimal(100) },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const svc = new NettingService(prisma, accounting);

    const out = await svc.createNetting(orgId, cpId, 100, LedgerType.NAS);

    expect(out.transactionId).toBe("txn-net-1");
    expect(accounting.postJournalInTransaction).toHaveBeenCalledTimes(1);
    const j = journalParams[0];
    expect(j.counterpartyId).toBe(cpId);
    const dr531 = j.lines.find(
      (l) => l.accountCode === PAYABLE_SUPPLIERS_ACCOUNT_CODE,
    );
    const cr211 = j.lines.find(
      (l) => l.accountCode === RECEIVABLE_ACCOUNT_CODE,
    );
    expect(String(dr531?.debit)).toBe("100");
    expect(String(cr211?.credit)).toBe("100");

    expect(tx.invoicePayment.create).toHaveBeenCalled();
    expect(tx.invoice.update).toHaveBeenCalled();
    const upd = tx.invoice.update.mock.calls[0][0] as {
      data: { status: InvoiceStatus };
    };
    expect(upd.data.status).toBe(InvoiceStatus.PAID);
  });

  it("logs server-side when posted amount differs from previewSuggestedAmount", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue({ transactionId: "txn-net-2" }),
    } as unknown as AccountingService;

    const invoiceRow = {
      id: invId,
      totalAmount: new Decimal(200),
      status: InvoiceStatus.SENT,
      revenueRecognized: true,
      dueDate: new Date(),
      payments: [] as { amount: Decimal }[],
    };
    const snapshotInvoices = () => [
      {
        ...invoiceRow,
        payments: invoiceRow.payments.map((p) => ({ amount: p.amount })),
      },
    ];
    const tx = {
      invoice: {
        findMany: jest.fn(async () => snapshotInvoices()),
        findFirstOrThrow: jest.fn(async () => ({
          id: invoiceRow.id,
          totalAmount: invoiceRow.totalAmount,
          status: invoiceRow.status,
          payments: invoiceRow.payments.map((p) => ({ amount: p.amount })),
        })),
        update: jest.fn().mockResolvedValue({}),
      },
      invoicePayment: {
        create: jest.fn(
          async ({ data }: { data: { amount: Decimal } }) => {
            invoiceRow.payments.push({ amount: data.amount });
          },
        ),
      },
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      counterparty: {
        findFirst: jest.fn().mockResolvedValue({
          id: cpId,
          name: "Test CP",
          isVatPayer: false,
        }),
      },
      invoice: {
        findMany: jest.fn(async () => snapshotInvoices()),
      },
      account: {
        findFirst: jest.fn(
          async ({ where: { code } }: { where: { code: string } }) => {
            if (code === RECEIVABLE_ACCOUNT_CODE) return { id: "acc-211" };
            if (code === PAYABLE_SUPPLIERS_ACCOUNT_CODE) return { id: "acc-531" };
            return null;
          },
        ),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([
          { debit: new Decimal(0), credit: new Decimal(200) },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const svc = new NettingService(prisma, accounting);
    await svc.createNetting(orgId, cpId, 50, LedgerType.NAS, undefined, {
      userId: "user-1",
      previewSuggestedAmount: 200,
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Netting amount manually adjusted"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("userId=user-1"));
    logSpy.mockRestore();
  });
});

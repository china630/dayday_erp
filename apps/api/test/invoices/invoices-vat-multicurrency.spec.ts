import { Prisma } from "@dayday/database";
import { InvoicesService } from "../../src/invoices/invoices.service";

describe("Invoices VAT and multi-currency rounding", () => {
  it("VAT inclusive math stays stable for non-AZN invoice rows", async () => {
    const service = new InvoicesService(
      { product: { findFirst: jest.fn() } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const out = await (service as any).buildItems(
      "org-1",
      [{ quantity: 1, unitPrice: 118, vatRate: 18, description: "USD service" }],
      { vatInclusive: true },
    );

    expect(out.items[0].unitPrice.toFixed(4)).toBe("100.0000");
    expect(out.items[0].lineTotal.toFixed(4)).toBe("118.0000");
    expect(out.total.toFixed(4)).toBe("118.0000");
  });

  it("multi-currency rounding difference posts to FX account", async () => {
    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue({ transactionId: "tx-1" }),
    };
    const service = new InvoicesService(
      {} as any,
      accounting as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { createAutoFromInvoicePayment: jest.fn().mockResolvedValue({}) } as any,
    );
    const tx = {
      invoicePayment: { create: jest.fn().mockResolvedValue({ id: "p-1" }) },
    } as any;

    await (service as any).applyPaymentInTransaction(
      tx,
      "org-1",
      {
        id: "inv-1",
        number: "INV-1",
        totalAmount: new Prisma.Decimal(100),
        debitAccountCode: "221",
        counterpartyId: "cp-1",
        currency: "USD",
      },
      new Prisma.Decimal(100),
      new Date("2026-04-20T00:00:00.000Z"),
      "221",
      { roundingDifference: new Prisma.Decimal("0.01"), skipRegistryMirror: true },
    );

    expect(accounting.postJournalInTransaction).toHaveBeenNthCalledWith(
      2,
      tx,
      expect.objectContaining({
        lines: [
          expect.objectContaining({ accountCode: "221", debit: "0.01", credit: 0 }),
          expect.objectContaining({ accountCode: "662", debit: 0, credit: "0.01" }),
        ],
      }),
    );
  });

  it("multi-currency negative rounding posts to FX loss account", async () => {
    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue({ transactionId: "tx-1" }),
    };
    const service = new InvoicesService(
      {} as any,
      accounting as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { createAutoFromInvoicePayment: jest.fn().mockResolvedValue({}) } as any,
    );
    const tx = {
      invoicePayment: { create: jest.fn().mockResolvedValue({ id: "p-1" }) },
    } as any;

    await (service as any).applyPaymentInTransaction(
      tx,
      "org-1",
      {
        id: "inv-1",
        number: "INV-1",
        totalAmount: new Prisma.Decimal(100),
        debitAccountCode: "221",
        counterpartyId: "cp-1",
        currency: "USD",
      },
      new Prisma.Decimal(100),
      new Date("2026-04-20T00:00:00.000Z"),
      "221",
      { roundingDifference: new Prisma.Decimal("-0.01"), skipRegistryMirror: true },
    );

    expect(accounting.postJournalInTransaction).toHaveBeenNthCalledWith(
      2,
      tx,
      expect.objectContaining({
        lines: [
          expect.objectContaining({ accountCode: "562", debit: "0.01", credit: 0 }),
          expect.objectContaining({ accountCode: "221", debit: 0, credit: "0.01" }),
        ],
      }),
    );
  });
});

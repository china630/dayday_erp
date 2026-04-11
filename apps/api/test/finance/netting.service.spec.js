"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@dayday/database");
const database_2 = require("@dayday/database");
const netting_service_1 = require("../../src/accounting/netting.service");
const ledger_constants_1 = require("../../src/ledger.constants");
describe("NettingService.createNetting (взаимозачёт)", () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const cpId = "00000000-0000-0000-0000-0000000000c1";
    const invId = "00000000-0000-0000-0000-0000000000d1";
    it("проводка Дт 531 / Кт 211, распределение оплат, инвойс PAID", async () => {
        const journalParams = [];
        const accounting = {
            postJournalInTransaction: jest.fn(async (_tx, params) => {
                journalParams.push({
                    lines: params.lines,
                    counterpartyId: params.counterpartyId,
                });
                return { transactionId: "txn-net-1" };
            }),
        };
        const invoiceRow = {
            id: invId,
            totalAmount: new database_1.Decimal(100),
            status: database_2.InvoiceStatus.SENT,
            revenueRecognized: true,
            dueDate: new Date(),
            payments: [],
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
                create: jest.fn(async ({ data, }) => {
                    invoiceRow.payments.push({ amount: data.amount });
                }),
            },
        };
        const prisma = {
            counterparty: {
                findFirst: jest.fn().mockResolvedValue({ id: cpId, name: "Test CP" }),
            },
            invoice: {
                findMany: jest.fn(async () => snapshotInvoices()),
            },
            account: {
                findFirst: jest.fn(async ({ where: { code }, }) => {
                    if (code === ledger_constants_1.RECEIVABLE_ACCOUNT_CODE)
                        return { id: "acc-211" };
                    if (code === ledger_constants_1.PAYABLE_SUPPLIERS_ACCOUNT_CODE)
                        return { id: "acc-531" };
                    return null;
                }),
            },
            journalEntry: {
                findMany: jest.fn().mockResolvedValue([
                    { debit: new database_1.Decimal(0), credit: new database_1.Decimal(100) },
                ]),
            },
            $transaction: jest.fn(async (fn) => fn(tx)),
        };
        const svc = new netting_service_1.NettingService(prisma, accounting);
        const out = await svc.createNetting(orgId, cpId, 100, database_2.LedgerType.NAS);
        expect(out.transactionId).toBe("txn-net-1");
        expect(accounting.postJournalInTransaction).toHaveBeenCalledTimes(1);
        const j = journalParams[0];
        expect(j.counterpartyId).toBe(cpId);
        const dr531 = j.lines.find((l) => l.accountCode === ledger_constants_1.PAYABLE_SUPPLIERS_ACCOUNT_CODE);
        const cr211 = j.lines.find((l) => l.accountCode === ledger_constants_1.RECEIVABLE_ACCOUNT_CODE);
        expect(String(dr531?.debit)).toBe("100");
        expect(String(cr211?.credit)).toBe("100");
        expect(tx.invoicePayment.create).toHaveBeenCalled();
        expect(tx.invoice.update).toHaveBeenCalled();
        const upd = tx.invoice.update.mock.calls[0][0];
        expect(upd.data.status).toBe(database_2.InvoiceStatus.PAID);
    });
});
//# sourceMappingURL=netting.service.spec.js.map
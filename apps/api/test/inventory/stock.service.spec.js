"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@dayday/database");
const ledger_constants_1 = require("../../src/ledger.constants");
const inventory_service_1 = require("../../src/inventory/inventory.service");
describe("InventoryService (stock / adjust)", () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const whId = "00000000-0000-0000-0000-000000000002";
    const prodId = "00000000-0000-0000-0000-000000000003";
    it("списание OUT: уменьшает остаток и создаёт проводку Дт 731 — Кт 201", async () => {
        const journalCalls = [];
        const accounting = {
            postJournalInTransaction: jest.fn(async (_tx, params) => {
                journalCalls.push({ lines: params.lines });
                return { transactionId: "txn-adj-1" };
            }),
        };
        const tx = {
            stockItem: {
                findUnique: jest.fn().mockResolvedValue({
                    quantity: new database_1.Decimal(10),
                    averageCost: new database_1.Decimal(5),
                }),
                upsert: jest.fn().mockResolvedValue({}),
            },
            stockMovement: {
                create: jest.fn().mockResolvedValue({}),
            },
        };
        const prisma = {
            warehouse: {
                findFirst: jest.fn().mockResolvedValue({ id: whId, organizationId: orgId }),
            },
            product: {
                findFirst: jest.fn().mockResolvedValue({ id: prodId, organizationId: orgId }),
            },
            organization: {
                findUnique: jest.fn().mockResolvedValue({ settings: {} }),
            },
            $transaction: jest.fn(async (fn) => fn(tx)),
        };
        const svc = new inventory_service_1.InventoryService(prisma, accounting);
        await svc.adjustStock(orgId, {
            warehouseId: whId,
            productId: prodId,
            quantity: 2,
            type: "OUT",
            inventoryAccountCode: "201",
        });
        expect(tx.stockItem.upsert).toHaveBeenCalled();
        expect(accounting.postJournalInTransaction).toHaveBeenCalledTimes(1);
        const lines = journalCalls[0].lines;
        const dr731 = lines.find((l) => l.accountCode === ledger_constants_1.MISC_OPERATING_EXPENSE_ACCOUNT_CODE);
        const cr201 = lines.find((l) => l.accountCode === ledger_constants_1.INVENTORY_GOODS_ACCOUNT_CODE);
        expect(dr731).toBeDefined();
        expect(cr201).toBeDefined();
        expect(String(dr731?.debit)).toBe("10");
        expect(String(cr201?.credit)).toBe("10");
    });
});
//# sourceMappingURL=stock.service.spec.js.map
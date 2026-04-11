"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const database_1 = require("@dayday/database");
const inventory_audit_service_1 = require("../../src/inventory/inventory-audit.service");
describe("InventoryAuditService", () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const wh1 = "10000000-0000-0000-0000-000000000001";
    const wh2 = "10000000-0000-0000-0000-000000000002";
    const p1 = "20000000-0000-0000-0000-000000000001";
    const p2 = "20000000-0000-0000-0000-000000000002";
    const baseApprovedDto = {
        date: "2026-04-03",
        status: database_1.InventoryAuditStatus.APPROVED,
        items: [
            {
                warehouseId: wh1,
                productId: p1,
                factQty: 5,
                inventoryAccountCode: "201",
            },
            {
                warehouseId: wh2,
                productId: p2,
                factQty: 5,
                inventoryAccountCode: "201",
            },
        ],
    };
    it("APPROVED: проводит опись — вызывает adjustStockInTransaction по строкам с расхождениями и создаёт документ", async () => {
        const adjustStockInTransaction = jest
            .fn()
            .mockResolvedValue({ type: "OUT", amount: "25" });
        const inventory = {
            adjustStockInTransaction,
        };
        const mockTx = {
            stockItem: {
                findFirst: jest.fn().mockResolvedValue({
                    quantity: new database_1.Decimal(10),
                    averageCost: new database_1.Decimal(5),
                }),
            },
            inventoryAudit: {
                create: jest.fn().mockResolvedValue({
                    id: "audit-1",
                    status: database_1.InventoryAuditStatus.APPROVED,
                }),
            },
        };
        const prisma = {
            $transaction: jest.fn(async (fn) => fn(mockTx)),
            inventoryAudit: {
                create: jest.fn(),
            },
        };
        const svc = new inventory_audit_service_1.InventoryAuditService(prisma, inventory);
        await svc.create(orgId, baseApprovedDto, database_1.UserRole.ACCOUNTANT);
        expect(adjustStockInTransaction).toHaveBeenCalledTimes(2);
        expect(mockTx.inventoryAudit.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: database_1.InventoryAuditStatus.APPROVED,
                organizationId: orgId,
            }),
        }));
    });
    it("APPROVED: при ошибке корректировки на второй строке откатывает транзакцию — документ не создаётся", async () => {
        const adjustStockInTransaction = jest
            .fn()
            .mockResolvedValueOnce({ type: "OUT", amount: "25" })
            .mockRejectedValueOnce(new Error("stock fail"));
        const inventory = {
            adjustStockInTransaction,
        };
        const mockTx = {
            stockItem: {
                findFirst: jest.fn().mockResolvedValue({
                    quantity: new database_1.Decimal(10),
                    averageCost: new database_1.Decimal(5),
                }),
            },
            inventoryAudit: {
                create: jest.fn().mockResolvedValue({ id: "should-not" }),
            },
        };
        const prisma = {
            $transaction: jest.fn(async (fn) => fn(mockTx)),
            inventoryAudit: {
                create: jest.fn(),
            },
        };
        const svc = new inventory_audit_service_1.InventoryAuditService(prisma, inventory);
        await expect(svc.create(orgId, baseApprovedDto, database_1.UserRole.ACCOUNTANT)).rejects.toThrow("stock fail");
        expect(adjustStockInTransaction).toHaveBeenCalledTimes(2);
        expect(mockTx.inventoryAudit.create).not.toHaveBeenCalled();
    });
    it("APPROVED: роль USER не может провести опись (assertMayPostManualJournal)", async () => {
        const adjustStockInTransaction = jest.fn();
        const inventory = {
            adjustStockInTransaction,
        };
        const prisma = {
            $transaction: jest.fn(),
            inventoryAudit: { create: jest.fn() },
        };
        const svc = new inventory_audit_service_1.InventoryAuditService(prisma, inventory);
        await expect(svc.create(orgId, {
            date: "2026-04-03",
            status: database_1.InventoryAuditStatus.APPROVED,
            items: [],
        }, database_1.UserRole.USER)).rejects.toThrow(common_1.ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(adjustStockInTransaction).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=inventory-audit.service.spec.js.map
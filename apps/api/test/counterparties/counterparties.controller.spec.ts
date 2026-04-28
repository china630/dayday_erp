import { CounterpartiesController } from "../../src/counterparties/counterparties.controller";
import { CounterpartyKind, CounterpartyRole } from "@dayday/database";

describe("CounterpartiesController degraded mode", () => {
  it("creates counterparty manually and writes audit event when e-taxes path fails", async () => {
    const prisma = {
      counterparty: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // dup check
          .mockResolvedValueOnce(null), // update path lookup not used
        create: jest.fn().mockResolvedValue({
          id: "cp-1",
          organizationId: "org-1",
          taxId: "1234567890",
          name: "Manual LLC",
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const svc = {
      findOrCreateByVoen: jest.fn().mockRejectedValue(new Error("e-taxes down")),
      syncDirectoryAfterLocalSave: jest.fn().mockResolvedValue(undefined),
    } as any;
    const controller = new CounterpartiesController(prisma, svc);

    const out = await controller.create("org-1", {
      name: "Manual LLC",
      taxId: "1234567890",
      kind: CounterpartyKind.LEGAL_ENTITY,
      role: CounterpartyRole.CUSTOMER,
      address: undefined,
      email: undefined,
      iban: undefined,
      isVatPayer: undefined,
      portalLocale: "az",
    });

    expect(out.id).toBe("cp-1");
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(prisma.counterparty.create).toHaveBeenCalled();
  });

  it("delegates merge request to service", async () => {
    const prisma = {} as any;
    const svc = {
      mergeCounterparties: jest
        .fn()
        .mockResolvedValue({ mergedIntoId: "target-id", sourceId: "source-id" }),
    } as any;
    const controller = new CounterpartiesController(prisma, svc);

    const out = await controller.merge("org-1", {
      sourceId: "11111111-1111-4111-8111-111111111111",
      targetId: "22222222-2222-4222-8222-222222222222",
    });

    expect(svc.mergeCounterparties).toHaveBeenCalledWith({
      organizationId: "org-1",
      sourceId: "11111111-1111-4111-8111-111111111111",
      targetId: "22222222-2222-4222-8222-222222222222",
    });
    expect(out.mergedIntoId).toBe("target-id");
  });
});

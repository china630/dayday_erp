import { BankingGatewayService } from "../../src/banking/banking-gateway.service";

describe("SalaryRegistry payout strategy", () => {
  it("uses ABB direct XML path for ABB account", async () => {
    const prisma = {
      salaryRegistry: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          organizationId: "org-1",
          payrollRunId: "run-1",
          bankAccountId: "bank-1",
          status: "DRAFT",
          payoutFormat: "ABB_XML",
          payrollRun: {
            id: "run-1",
            year: 2026,
            month: 4,
            organization: { taxId: "1234567890" },
            slips: [
              {
                net: "1000.00",
                employee: {
                  firstName: "A",
                  lastName: "B",
                  finCode: "FIN1",
                  accountNumber: "AZ00TEST1",
                },
              },
            ],
          },
          bankAccount: {
            bankName: "ABB",
            currency: "AZN",
            iban: "AZ01ABB00000000000000000001",
            accountNumber: "221.01",
          },
        }),
        update: jest.fn().mockResolvedValue({ id: "reg-1", status: "SENT" }),
      },
    } as any;
    const abb = {
      buildSalaryPaymentXml: jest.fn().mockReturnValue("<xml/>"),
      sendSalaryRegistryXml: jest.fn().mockResolvedValue({ batchNumber: "BATCH-1" }),
    } as any;
    const service = new BankingGatewayService(
      prisma,
      {} as any,
      { logOrganizationSystemEvent: jest.fn() } as any,
      abb,
      { buildSalaryRegistryXlsx: jest.fn() } as any,
      { putObject: jest.fn() } as any,
    );

    await service.prepareSalaryRegistry("reg-1");
    expect(abb.buildSalaryPaymentXml).toHaveBeenCalled();
    expect(abb.sendSalaryRegistryXml).toHaveBeenCalled();
  });

  it("uses universal export path for non-ABB account", async () => {
    const prisma = {
      salaryRegistry: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-2",
          organizationId: "org-1",
          payrollRunId: "run-2",
          bankAccountId: "bank-2",
          status: "DRAFT",
          payoutFormat: "UNIVERSAL_XLSX",
          payrollRun: {
            id: "run-2",
            year: 2026,
            month: 4,
            organization: { taxId: "1234567890" },
            slips: [
              {
                net: "1000.00",
                employee: {
                  firstName: "A",
                  lastName: "B",
                  finCode: "FIN1",
                  accountNumber: "AZ00TEST1",
                },
              },
            ],
          },
          bankAccount: {
            bankName: "Pasha Bank",
            currency: "AZN",
            iban: "AZ01PAHA00000000000000000001",
            accountNumber: "221.02",
          },
        }),
        update: jest.fn().mockResolvedValue({ id: "reg-2", status: "SENT" }),
      },
    } as any;
    const universal = {
      buildSalaryRegistryXlsx: jest.fn().mockResolvedValue({
        filename: "reg.xlsx",
        base64: Buffer.from("xlsx").toString("base64"),
      }),
    } as any;
    const storage = { putObject: jest.fn().mockResolvedValue({ key: "k" }) } as any;
    const service = new BankingGatewayService(
      prisma,
      {} as any,
      { logOrganizationSystemEvent: jest.fn() } as any,
      { buildSalaryPaymentXml: jest.fn(), sendSalaryRegistryXml: jest.fn() } as any,
      universal,
      storage,
    );

    await service.prepareSalaryRegistry("reg-2");
    expect(universal.buildSalaryRegistryXlsx).toHaveBeenCalled();
    expect(storage.putObject).toHaveBeenCalled();
  });
});


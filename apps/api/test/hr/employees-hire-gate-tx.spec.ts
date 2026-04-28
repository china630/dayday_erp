import { HttpException } from "@nestjs/common";
import { EmployeeKind, Prisma } from "@dayday/database";
import { EmployeesService } from "../../src/hr/employees.service";

describe("EmployeesService hire-gate (M6 Serializable)", () => {
  it("create uses Serializable $transaction with quota check inside callback", async () => {
    const captured: { opts?: unknown } = {};
    const txClient = {
      jobPosition: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pos-1",
          totalSlots: 2,
        }),
      },
      employee: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: "emp-new",
          positionId: "pos-1",
          jobPosition: { department: { id: "d1", name: "D" } },
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>, opts?: unknown) => {
        captured.opts = opts;
        return fn(txClient);
      }),
    } as unknown as ConstructorParameters<typeof EmployeesService>[0];

    const svc = new EmployeesService(prisma);
    await svc.create("org-1", {
      finCode: "1".repeat(7),
      firstName: "A",
      lastName: "B",
      patronymic: "",
      positionId: "pos-1",
      startDate: "2026-01-01",
      hireDate: "2026-01-01",
      salary: 1000,
      kind: EmployeeKind.EMPLOYEE,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(captured.opts).toEqual(
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
    expect(txClient.jobPosition.findFirst).toHaveBeenCalled();
    expect(txClient.employee.count).toHaveBeenCalled();
    expect(txClient.employee.create).toHaveBeenCalled();
  });

  it("create: quota exceeded inside transaction → 402", async () => {
    const txClient = {
      jobPosition: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pos-1",
          totalSlots: 1,
        }),
      },
      employee: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
        fn(txClient),
      ),
    } as unknown as ConstructorParameters<typeof EmployeesService>[0];

    const svc = new EmployeesService(prisma);
    await expect(
      svc.create("org-1", {
        finCode: "2".repeat(7),
        firstName: "A",
        lastName: "B",
        patronymic: "",
        positionId: "pos-1",
        startDate: "2026-01-01",
        hireDate: "2026-01-01",
        salary: 1000,
        kind: EmployeeKind.EMPLOYEE,
      }),
    ).rejects.toThrow(HttpException);
    expect(txClient.employee.create).not.toHaveBeenCalled();
  });
});

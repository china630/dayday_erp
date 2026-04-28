import { Logger } from "@nestjs/common";
import { TimesheetStatus } from "@dayday/database";
import { TimesheetService } from "../../src/hr/timesheet.service";

describe("TimesheetService massApprove performance log (M6)", () => {
  it("logs duration when approving 100+ employee rows", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const employeeIds = Array.from({ length: 120 }, (_, i) => `emp-${i}`);
    const scoped = employeeIds.map((id) => ({ id }));

    const tsRow = {
      id: "ts-1",
      organizationId: "org-1",
      status: TimesheetStatus.DRAFT,
      year: 2026,
      month: 4,
    };
    const prisma = {
      timesheet: {
        findFirst: jest.fn().mockResolvedValue(tsRow),
      },
      employee: {
        findMany: jest.fn().mockImplementation((args: { where?: { id?: { in: string[] } } }) => {
          if (args?.where?.id?.in) {
            return scoped;
          }
          return [];
        }),
      },
      auditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 120 }),
      },
      timesheetEntry: { findMany: jest.fn().mockResolvedValue([]) },
      absence: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const svc = new TimesheetService(prisma);
    await svc.massApprove("org-1", "ts-1", employeeIds);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Timesheet massApprove: timesheetId=ts-1 employees=120 auditRowsMs=\d+$/,
      ),
    );
    logSpy.mockRestore();
  });

  it("does not log when fewer than 100 employees", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const employeeIds = ["e1", "e2"];
    const tsRow = {
      id: "ts-1",
      organizationId: "org-1",
      status: TimesheetStatus.DRAFT,
      year: 2026,
      month: 4,
    };
    const prisma = {
      timesheet: {
        findFirst: jest.fn().mockResolvedValue(tsRow),
      },
      employee: {
        findMany: jest.fn().mockImplementation((args: { where?: { id?: { in: string[] } } }) => {
          if (args?.where?.id?.in) {
            return employeeIds.map((id) => ({ id }));
          }
          return [];
        }),
      },
      auditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      timesheetEntry: { findMany: jest.fn().mockResolvedValue([]) },
      absence: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const svc = new TimesheetService(prisma);
    await svc.massApprove("org-1", "ts-1", employeeIds);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

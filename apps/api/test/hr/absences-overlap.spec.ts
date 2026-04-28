import { BadRequestException } from "@nestjs/common";
import { AbsencesService } from "../../src/hr/absences.service";

describe("Absences overlap guard", () => {
  function createService(overlap: unknown) {
    const prisma = {
      absence: {
        findFirst: jest.fn().mockResolvedValue(overlap),
        create: jest.fn(),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: "emp-1" }),
      },
    } as any;
    const absenceTypes = {
      assertInOrg: jest.fn().mockResolvedValue({
        id: "type-1",
        maxCalendarDays: null,
        code: "VACATION",
        nameAz: "Məzuniyyət",
      }),
    } as any;
    return new AbsencesService(prisma, absenceTypes);
  }

  it("returns user-friendly conflict payload for overlap", async () => {
    const svc = createService({
      id: "abs-1",
      absenceTypeId: "type-1",
      startDate: new Date("2026-04-01T12:00:00.000Z"),
      endDate: new Date("2026-04-10T12:00:00.000Z"),
      absenceType: { code: "VACATION", nameAz: "Məzuniyyət" },
    });
    await expect(
      svc.create("org-1", {
        employeeId: "emp-1",
        absenceTypeId: "type-1",
        startDate: "2026-04-05",
        endDate: "2026-04-12",
        note: "",
      }),
    ).rejects.toThrow(BadRequestException);

    try {
      await svc.create("org-1", {
        employeeId: "emp-1",
        absenceTypeId: "type-1",
        startDate: "2026-04-05",
        endDate: "2026-04-12",
        note: "",
      });
    } catch (e) {
      const ex = e as BadRequestException;
      const payload = ex.getResponse() as any;
      expect(payload.code).toBe("ABSENCE_OVERLAP");
      expect(payload.conflict.id).toBe("abs-1");
      expect(payload.conflict.absenceTypeCode).toBe("VACATION");
    }
  });
});


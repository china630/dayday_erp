import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AbsencePayFormula,
  Decimal,
  TimesheetEntryType,
  TimesheetStatus,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { isAzWorkingDay } from "./calendar/az-2026";
import { countAzWorkingDaysInMonth } from "./payroll-month-calendar";
import type { TimesheetBatchItemDto } from "./dto/timesheet-batch.dto";

function monthBoundsUtc(year: number, month: number): { start: Date; end: Date; lastDay: number } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, lastDay, 12, 0, 0, 0));
  return { start, end, lastDay };
}

function dayDateUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timesheetEntryTypeForAbsenceFormula(
  formula: AbsencePayFormula,
): TimesheetEntryType {
  switch (formula) {
    case AbsencePayFormula.SICK_LEAVE_STAJ:
      return TimesheetEntryType.SICK;
    case AbsencePayFormula.UNPAID_RECORD:
      return TimesheetEntryType.OFF;
    case AbsencePayFormula.LABOR_LEAVE_304:
    default:
      return TimesheetEntryType.VACATION;
  }
}

function defaultHoursForType(t: TimesheetEntryType): Decimal {
  if (t === TimesheetEntryType.OFF) {
    return new Decimal(0);
  }
  return new Decimal(8);
}

@Injectable()
export class TimesheetService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMonthIfExists(organizationId: string, year: number, month: number) {
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      throw new BadRequestException("year must be 1900–2100");
    }
    if (month < 1 || month > 12) {
      throw new BadRequestException("month must be 1–12");
    }
    /** findFirst: prismaTenantExtension ломает findUnique по составному unique (merge AND). */
    const ts = await this.prisma.timesheet.findFirst({
      where: { organizationId, year, month },
    });
    if (!ts) {
      return { timesheet: null, employees: [], entries: [] };
    }
    return this.getFull(organizationId, ts.id);
  }

  async getOrCreate(organizationId: string, year: number, month: number) {
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      throw new BadRequestException("year must be 1900–2100");
    }
    if (month < 1 || month > 12) {
      throw new BadRequestException("month must be 1–12");
    }
    /** см. findByMonthIfExists — findFirst из‑за prismaTenantExtension */
    let ts = await this.prisma.timesheet.findFirst({
      where: { organizationId, year, month },
    });
    if (!ts) {
      ts = await this.prisma.timesheet.create({
        data: { organizationId, year, month, status: TimesheetStatus.DRAFT },
      });
    }
    return this.getFull(organizationId, ts.id);
  }

  async getFull(organizationId: string, timesheetId: string) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, organizationId },
    });
    if (!ts) throw new NotFoundException("Timesheet not found");
    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, finCode: true },
    });
    const entries = await this.prisma.timesheetEntry.findMany({
      where: { timesheetId },
      orderBy: [{ employeeId: "asc" }, { dayDate: "asc" }],
    });
    const entriesJson = entries.map((e) => ({
      ...e,
      hours: e.hours != null ? e.hours.toString() : "0",
    }));
    return { timesheet: ts, employees, entries: entriesJson };
  }

  private assertDraft(ts: { status: TimesheetStatus }) {
    if (ts.status !== TimesheetStatus.DRAFT) {
      throw new ForbiddenException("Табель утверждён и доступен только для чтения");
    }
  }

  async autofill(organizationId: string, timesheetId: string) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, organizationId },
    });
    if (!ts) throw new NotFoundException("Timesheet not found");
    this.assertDraft(ts);
    const { year, month } = ts;
    const { lastDay } = monthBoundsUtc(year, month);
    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      select: { id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      for (const emp of employees) {
        for (let d = 1; d <= lastDay; d++) {
          const dayDate = dayDateUtc(year, month, d);
          const existing = await tx.timesheetEntry.findUnique({
            where: {
              timesheetId_employeeId_dayDate: {
                timesheetId,
                employeeId: emp.id,
                dayDate,
              },
            },
          });
          if (existing?.lockedFromAbsence) {
            continue;
          }
          const work = isAzWorkingDay(year, month - 1, d);
          const type = work ? TimesheetEntryType.WORK : TimesheetEntryType.OFF;
          const hours = defaultHoursForType(type);
          await tx.timesheetEntry.upsert({
            where: {
              timesheetId_employeeId_dayDate: {
                timesheetId,
                employeeId: emp.id,
                dayDate,
              },
            },
            create: {
              timesheetId,
              employeeId: emp.id,
              dayDate,
              type,
              hours,
              lockedFromAbsence: false,
            },
            update: { type, hours, lockedFromAbsence: false },
          });
        }
      }
    });
    return this.getFull(organizationId, timesheetId);
  }

  async syncAbsences(organizationId: string, timesheetId: string) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, organizationId },
    });
    if (!ts) throw new NotFoundException("Timesheet not found");
    this.assertDraft(ts);
    const { year, month } = ts;
    const { start: monthStart, end: monthEnd, lastDay } = monthBoundsUtc(year, month);

    const absences = await this.prisma.absence.findMany({
      where: {
        organizationId,
        approved: true,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: { absenceType: true },
    });

    const startIso = isoDay(monthStart);
    const endIso = isoDay(monthEnd);

    await this.prisma.$transaction(async (tx) => {
      for (const a of absences) {
        const t = timesheetEntryTypeForAbsenceFormula(a.absenceType.formula);
        const hours = defaultHoursForType(t);
        const absFrom = isoDay(a.startDate);
        const absTo = isoDay(a.endDate);
        for (let d = 1; d <= lastDay; d++) {
          const dayDate = dayDateUtc(year, month, d);
          const di = isoDay(dayDate);
          if (di < absFrom || di > absTo || di < startIso || di > endIso) {
            continue;
          }
          await tx.timesheetEntry.upsert({
            where: {
              timesheetId_employeeId_dayDate: {
                timesheetId,
                employeeId: a.employeeId,
                dayDate,
              },
            },
            create: {
              timesheetId,
              employeeId: a.employeeId,
              dayDate,
              type: t,
              hours,
              lockedFromAbsence: true,
            },
            update: {
              type: t,
              hours,
              lockedFromAbsence: true,
            },
          });
        }
      }
    });
    return this.getFull(organizationId, timesheetId);
  }

  async batchUpdate(
    organizationId: string,
    timesheetId: string,
    batches: TimesheetBatchItemDto[],
  ) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, organizationId },
    });
    if (!ts) throw new NotFoundException("Timesheet not found");
    this.assertDraft(ts);
    const { year, month } = ts;
    const { lastDay } = monthBoundsUtc(year, month);

    await this.prisma.$transaction(async (tx) => {
      for (const b of batches) {
        if (b.fromDay > b.toDay) {
          throw new BadRequestException("fromDay не может быть больше toDay");
        }
        if (b.fromDay < 1 || b.toDay > lastDay) {
          throw new BadRequestException("Диапазон дней выходит за пределы месяца");
        }
        const emp = await tx.employee.findFirst({
          where: { id: b.employeeId, organizationId },
        });
        if (!emp) {
          throw new BadRequestException(`Сотрудник ${b.employeeId} не найден`);
        }
        const hrs =
          b.hours != null
            ? new Decimal(b.hours)
            : defaultHoursForType(b.type);
        for (let d = b.fromDay; d <= b.toDay; d++) {
          const dayDate = dayDateUtc(year, month, d);
          const existing = await tx.timesheetEntry.findUnique({
            where: {
              timesheetId_employeeId_dayDate: {
                timesheetId,
                employeeId: b.employeeId,
                dayDate,
              },
            },
          });
          if (existing?.lockedFromAbsence) {
            continue;
          }
          await tx.timesheetEntry.upsert({
            where: {
              timesheetId_employeeId_dayDate: {
                timesheetId,
                employeeId: b.employeeId,
                dayDate,
              },
            },
            create: {
              timesheetId,
              employeeId: b.employeeId,
              dayDate,
              type: b.type,
              hours: hrs,
              lockedFromAbsence: false,
            },
            update: { type: b.type, hours: hrs, lockedFromAbsence: false },
          });
        }
      }
    });
    return this.getFull(organizationId, timesheetId);
  }

  async approve(organizationId: string, timesheetId: string) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, organizationId },
    });
    if (!ts) throw new NotFoundException("Timesheet not found");
    if (ts.status === TimesheetStatus.APPROVED) {
      throw new ConflictException("Табель уже утверждён");
    }
    await this.prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: TimesheetStatus.APPROVED },
    });
    return this.getFull(organizationId, timesheetId);
  }

  /** Агрегаты по сотруднику для импорта в ведомость + mix для brüt ə/h (TK AР). */
  async summarizeForPayroll(timesheetId: string, organizationId: string) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, organizationId, status: TimesheetStatus.APPROVED },
    });
    if (!ts) {
      throw new BadRequestException("Табель не найден или не утверждён");
    }
    const entries = await this.prisma.timesheetEntry.findMany({
      where: { timesheetId },
    });
    const { year, month } = ts;
    const normWorkingDays = countAzWorkingDaysInMonth(year, month);

    const byEmp = new Map<
      string,
      { work: number; vacation: number; sick: number; businessTrip: number }
    >();
    const mixEmp = new Map<
      string,
      { workBizWorkingDays: number; vacationCalendarDays: number }
    >();

    for (const e of entries) {
      let row = byEmp.get(e.employeeId);
      if (!row) {
        row = { work: 0, vacation: 0, sick: 0, businessTrip: 0 };
        byEmp.set(e.employeeId, row);
      }
      switch (e.type) {
        case TimesheetEntryType.WORK:
          row.work += 1;
          break;
        case TimesheetEntryType.VACATION:
          row.vacation += 1;
          break;
        case TimesheetEntryType.SICK:
          row.sick += 1;
          break;
        case TimesheetEntryType.BUSINESS_TRIP:
          row.businessTrip += 1;
          break;
        default:
          break;
      }

      const d = e.dayDate.getUTCDate();
      const wd = isAzWorkingDay(year, month - 1, d);
      let mx = mixEmp.get(e.employeeId);
      if (!mx) {
        mx = { workBizWorkingDays: 0, vacationCalendarDays: 0 };
        mixEmp.set(e.employeeId, mx);
      }
      switch (e.type) {
        case TimesheetEntryType.WORK:
        case TimesheetEntryType.BUSINESS_TRIP:
          if (wd) mx.workBizWorkingDays += 1;
          break;
        case TimesheetEntryType.VACATION:
          mx.vacationCalendarDays += 1;
          break;
        default:
          break;
      }
    }

    const mixByEmployeeId: Record<
      string,
      {
        normWorkingDays: number;
        workBizWorkingDays: number;
        vacationCalendarDays: number;
      }
    > = {};
    for (const [id, v] of mixEmp) {
      mixByEmployeeId[id] = {
        normWorkingDays,
        workBizWorkingDays: v.workBizWorkingDays,
        vacationCalendarDays: v.vacationCalendarDays,
      };
    }

    return {
      year: ts.year,
      month: ts.month,
      normWorkingDays,
      byEmployeeId: Object.fromEntries(byEmp),
      mixByEmployeeId,
    };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AbsencePayFormula,
  Decimal,
  PayrollRunStatus,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAbsenceDto } from "./dto/create-absence.dto";
import { UpdateAbsenceDto } from "./dto/update-absence.dto";
import { SickPayCalcDto } from "./dto/sick-pay-calc.dto";
import { roundMoney2 } from "./payroll-calculator";
import { AbsenceTypesService } from "./absence-types.service";
import {
  SICK_LEAVE_EMPLOYER_CALENDAR_DAYS,
  sickLeaveEmployerPercent,
  totalServiceWholeYears,
} from "./sick-leave-ar";
import { monthEndUtc } from "./payroll-month-calendar";

function ymKey(year: number, month: number): number {
  return year * 100 + month;
}

/** 12 календарных месяцев, предшествующих месяцу начала отпуска. */
function vacationPayLookbackYmBounds(vacationStartUtc: Date): {
  startKey: number;
  endKey: number;
} {
  const y = vacationStartUtc.getUTCFullYear();
  const mo = vacationStartUtc.getUTCMonth() + 1;
  let endY = y;
  let endM = mo - 1;
  if (endM < 1) {
    endM = 12;
    endY -= 1;
  }
  let startY = endY;
  let startM = endM - 11;
  while (startM < 1) {
    startM += 12;
    startY -= 1;
  }
  return { startKey: ymKey(startY, startM), endKey: ymKey(endY, endM) };
}

function daysInclusiveUtc(start: Date, end: Date): number {
  const t0 = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const t1 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((t1 - t0) / (24 * 3600 * 1000)) + 1;
}

function dateOnlyUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0),
  );
}

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly absenceTypes: AbsenceTypesService,
  ) {}

  list(organizationId: string) {
    return this.prisma.absence.findMany({
      where: { organizationId },
      orderBy: [{ startDate: "desc" }],
      include: { employee: true, absenceType: true },
    });
  }

  async getOne(organizationId: string, id: string) {
    const row = await this.prisma.absence.findFirst({
      where: { id, organizationId },
      include: { employee: true, absenceType: true },
    });
    if (!row) throw new NotFoundException("Absence not found");
    return row;
  }

  async create(organizationId: string, dto: CreateAbsenceDto) {
    await this.ensureEmployee(organizationId, dto.employeeId);
    const at = await this.absenceTypes.assertInOrg(
      organizationId,
      dto.absenceTypeId,
    );
    const start = this.parseDateOnly(dto.startDate);
    const end = this.parseDateOnly(dto.endDate);
    if (end < start) {
      throw new BadRequestException("endDate must be >= startDate");
    }
    const calDays = daysInclusiveUtc(start, end);
    if (at.maxCalendarDays != null && calDays > at.maxCalendarDays) {
      throw new BadRequestException(
        `Absence longer than allowed for this type (max ${at.maxCalendarDays} calendar days)`,
      );
    }
    return this.prisma.absence.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        absenceTypeId: dto.absenceTypeId,
        startDate: start,
        endDate: end,
        note: (dto.note ?? "").trim(),
      },
      include: { employee: true, absenceType: true },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateAbsenceDto) {
    const existing = await this.getOne(organizationId, id);
    if (dto.employeeId != null) {
      await this.ensureEmployee(organizationId, dto.employeeId);
    }
    let absenceTypeId = existing.absenceTypeId;
    if (dto.absenceTypeId != null) {
      await this.absenceTypes.assertInOrg(organizationId, dto.absenceTypeId);
      absenceTypeId = dto.absenceTypeId;
    }
    const at = await this.absenceTypes.assertInOrg(organizationId, absenceTypeId);
    const start =
      dto.startDate != null
        ? this.parseDateOnly(dto.startDate)
        : existing.startDate;
    const end =
      dto.endDate != null ? this.parseDateOnly(dto.endDate) : existing.endDate;
    if (end < start) {
      throw new BadRequestException("endDate must be >= startDate");
    }
    const calDays = daysInclusiveUtc(start, end);
    if (at.maxCalendarDays != null && calDays > at.maxCalendarDays) {
      throw new BadRequestException(
        `Absence longer than allowed for this type (max ${at.maxCalendarDays} calendar days)`,
      );
    }
    return this.prisma.absence.update({
      where: { id },
      data: {
        ...(dto.employeeId != null ? { employeeId: dto.employeeId } : {}),
        ...(dto.absenceTypeId != null ? { absenceTypeId: dto.absenceTypeId } : {}),
        ...(dto.startDate != null ? { startDate: start } : {}),
        ...(dto.endDate != null ? { endDate: end } : {}),
        ...(dto.note != null ? { note: dto.note.trim() } : {}),
      },
      include: { employee: true, absenceType: true },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.getOne(organizationId, id);
    await this.prisma.absence.delete({ where: { id } });
  }

  /**
   * Orta aylıq gross: keçirilmiş payroll slip-ləri, anchor tarixindən əvvəlki 12 təqvim ayı.
   */
  async averageMonthlyGrossFromPostedSlips(
    organizationId: string,
    employeeId: string,
    anchorUtc: Date,
  ): Promise<{ avgMonthly: Decimal; nMonths: number; totalGross: Decimal } | null> {
    const { startKey, endKey } = vacationPayLookbackYmBounds(anchorUtc);
    const slips = await this.prisma.payrollSlip.findMany({
      where: {
        organizationId,
        employeeId,
        payrollRun: { status: PayrollRunStatus.POSTED },
      },
      include: { payrollRun: true },
    });
    const inWindow = slips.filter((s) => {
      const k = ymKey(s.payrollRun.year, s.payrollRun.month);
      return k >= startKey && k <= endKey;
    });
    const monthSet = new Set<string>();
    let totalGross = new Decimal(0);
    for (const s of inWindow) {
      const r = s.payrollRun;
      monthSet.add(`${r.year}-${r.month}`);
      totalGross = totalGross.add(s.gross);
    }
    const nMonths = monthSet.size;
    if (nMonths === 0) return null;
    return {
      avgMonthly: totalGross.div(nMonths),
      nMonths,
      totalGross,
    };
  }

  /**
   * Ay üzrə brüt əmək haqqı: təsdiq tabell + məzuniyyət 30.4 + xəstəlik (işəgötürən hissəsi).
   * Orta yoxdursa — müqavilə məbləği 30.4 üçün baza kimi götürülür (draft vedomost).
   */
  async adjustGrossForStampedTimesheetMonth(
    organizationId: string,
    employeeId: string,
    contractMonthlyGross: Decimal,
    year: number,
    month: number,
    mix: {
      normWorkingDays: number;
      workBizWorkingDays: number;
      vacationCalendarDays: number;
    },
  ): Promise<Decimal> {
    const norm = mix.normWorkingDays;
    if (norm <= 0) {
      return roundMoney2(contractMonthlyGross);
    }

    const emp = await this.prisma.employee.findFirstOrThrow({
      where: { id: employeeId, organizationId },
    });

    const anchor = monthEndUtc(year, month);
    const avgRow = await this.averageMonthlyGrossFromPostedSlips(
      organizationId,
      employeeId,
      anchor,
    );
    const avgMonthly = avgRow?.avgMonthly ?? contractMonthlyGross;
    const daily304 = avgMonthly.div(30.4);

    const partWork = contractMonthlyGross.mul(
      new Decimal(mix.workBizWorkingDays).div(norm),
    );
    const partVac = daily304.mul(mix.vacationCalendarDays);
    const sickEmployer = await this.sickEmployerPortionAzForMonth(
      organizationId,
      employeeId,
      year,
      month,
      daily304,
      emp.startDate,
    );

    return roundMoney2(partWork.add(partVac).add(sickEmployer));
  }

  private async sickEmployerPortionAzForMonth(
    organizationId: string,
    employeeId: string,
    year: number,
    month: number,
    dailyRate: Decimal,
    employmentStart: Date,
  ): Promise<Decimal> {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month - 1, last, 12, 0, 0, 0));

    const absences = await this.prisma.absence.findMany({
      where: {
        organizationId,
        employeeId,
        approved: true,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        absenceType: { formula: AbsencePayFormula.SICK_LEAVE_STAJ },
      },
      include: { absenceType: true },
    });

    let employerCalendarDaysInMonth = 0;
    for (const a of absences) {
      const absStart = dateOnlyUtc(a.startDate);
      const absEnd = dateOnlyUtc(a.endDate);
      for (let d = 1; d <= last; d++) {
        const day = new Date(Date.UTC(year, month - 1, d, 12, 0, 0, 0));
        if (day < absStart || day > absEnd) continue;
        const pos = daysInclusiveUtc(absStart, day);
        if (pos <= SICK_LEAVE_EMPLOYER_CALENDAR_DAYS) {
          employerCalendarDaysInMonth += 1;
        }
      }
    }

    const stajYears = totalServiceWholeYears(employmentStart, monthEnd);
    const pct = sickLeaveEmployerPercent(stajYears);
    return roundMoney2(dailyRate.mul(employerCalendarDaysInMonth).mul(pct));
  }

  /**
   * (Средняя ЗП за 12 мес. / 30.4) × календарные дни — ТК AР (əmək məzuniyyəti və eyni formula).
   */
  async calculateVacationPay(
    organizationId: string,
    employeeId: string,
    vacationStart: string,
    vacationEnd: string,
    absenceTypeId?: string,
  ) {
    await this.ensureEmployee(organizationId, employeeId);
    if (absenceTypeId) {
      const at = await this.absenceTypes.assertInOrg(
        organizationId,
        absenceTypeId,
      );
      if (at.formula !== AbsencePayFormula.LABOR_LEAVE_304) {
        throw new BadRequestException(
          "absenceTypeId must be a type with LABOR_LEAVE_304 formula for this calculator",
        );
      }
    }
    const vStart = this.parseDateOnly(vacationStart);
    const vEnd = this.parseDateOnly(vacationEnd);
    if (vEnd < vStart) {
      throw new BadRequestException("vacationEnd must be >= vacationStart");
    }
    const calendarDays = daysInclusiveUtc(vStart, vEnd);

    const avg = await this.averageMonthlyGrossFromPostedSlips(
      organizationId,
      employeeId,
      vStart,
    );
    if (!avg) {
      throw new BadRequestException(
        "Нет проведённых расчётных листов за 12 месяцев, предшествующих отпуску",
      );
    }

    const { startKey, endKey } = vacationPayLookbackYmBounds(vStart);
    const avgMonthly = avg.avgMonthly;
    const dailyRate = avgMonthly.div(30.4);
    const amount = roundMoney2(dailyRate.mul(calendarDays));

    return {
      employeeId,
      vacationStart: vacationStart.slice(0, 10),
      vacationEnd: vacationEnd.slice(0, 10),
      calendarDays,
      monthsInAverage: avg.nMonths,
      totalGrossInWindow: roundMoney2(avg.totalGross).toFixed(2),
      averageMonthlyGross: roundMoney2(avgMonthly).toFixed(2),
      averageDailyGross: roundMoney2(dailyRate).toFixed(2),
      vacationPayAmount: amount.toFixed(2),
      lookbackStartYm: String(startKey),
      lookbackEndYm: String(endKey),
      divisor304: "30.4",
    };
  }

  /**
   * Xəstəlik: ilk 14 təqvim günü işəgötürən (staja görə %), sonrası DSMF (məbləğ ERP-dən kənar).
   */
  async calculateSickPay(organizationId: string, dto: SickPayCalcDto) {
    await this.ensureEmployee(organizationId, dto.employeeId);
    let typeId = dto.absenceTypeId;
    if (!typeId) {
      await this.absenceTypes.listOrSeed(organizationId);
      const sickId = await this.absenceTypes.getSickTypeId(organizationId);
      if (!sickId) {
        throw new BadRequestException("SICK_LEAVE absence type not found");
      }
      typeId = sickId;
    }
    const at = await this.absenceTypes.assertInOrg(organizationId, typeId);
    if (at.formula !== AbsencePayFormula.SICK_LEAVE_STAJ) {
      throw new BadRequestException("absence type must use SICK_LEAVE_STAJ formula");
    }

    const pStart = this.parseDateOnly(dto.periodStart);
    const pEnd = this.parseDateOnly(dto.periodEnd);
    if (pEnd < pStart) {
      throw new BadRequestException("periodEnd must be >= periodStart");
    }
    const calendarDays = daysInclusiveUtc(pStart, pEnd);

    const emp = await this.prisma.employee.findFirstOrThrow({
      where: { id: dto.employeeId, organizationId },
    });
    const stajYears = totalServiceWholeYears(emp.startDate, pEnd);
    const employerPct = sickLeaveEmployerPercent(stajYears);
    const employerCalendarDays = Math.min(
      SICK_LEAVE_EMPLOYER_CALENDAR_DAYS,
      calendarDays,
    );
    const dsmfCalendarDays = Math.max(0, calendarDays - SICK_LEAVE_EMPLOYER_CALENDAR_DAYS);

    const avgRow = await this.averageMonthlyGrossFromPostedSlips(
      organizationId,
      dto.employeeId,
      pStart,
    );
    if (!avgRow) {
      throw new BadRequestException(
        "Нет проведённых расчётных листов за 12 месяцев для средней ЗП",
      );
    }
    const avgMonthly = avgRow.avgMonthly;
    const dailyRate = avgMonthly.div(30.4);
    const employerPay = roundMoney2(
      dailyRate.mul(employerCalendarDays).mul(employerPct),
    );

    return {
      employeeId: dto.employeeId,
      periodStart: dto.periodStart.slice(0, 10),
      periodEnd: dto.periodEnd.slice(0, 10),
      calendarDays,
      serviceWholeYears: stajYears,
      employerPercent: employerPct.mul(100).toFixed(0),
      employerCalendarDays,
      dsmfCalendarDays,
      averageMonthlyGross: roundMoney2(avgMonthly).toFixed(2),
      averageDailyGross: roundMoney2(dailyRate).toFixed(2),
      employerSickPayAmount: employerPay.toFixed(2),
      noteAz:
        dsmfCalendarDays > 0
          ? `${dsmfCalendarDays} təqvim günü üzrə ödəniş DSMF tərəfindən (sistemdən kənar).`
          : "",
    };
  }

  private parseDateOnly(iso: string): Date {
    const d = new Date(iso.slice(0, 10) + "T12:00:00.000Z");
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return d;
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const e = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
    });
    if (!e) throw new NotFoundException("Employee not found");
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Decimal, PayrollRunStatus } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAbsenceDto } from "./dto/create-absence.dto";
import { UpdateAbsenceDto } from "./dto/update-absence.dto";
import { roundMoney2 } from "./payroll-calculator";

function ymKey(year: number, month: number): number {
  return year * 100 + month;
}

/** 12 календарных месяцев, предшествующих месяцу начала отпуска (последний — месяц перед отпуском). */
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

@Injectable()
export class AbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.absence.findMany({
      where: { organizationId },
      orderBy: [{ startDate: "desc" }],
      include: { employee: true },
    });
  }

  async getOne(organizationId: string, id: string) {
    const row = await this.prisma.absence.findFirst({
      where: { id, organizationId },
      include: { employee: true },
    });
    if (!row) throw new NotFoundException("Absence not found");
    return row;
  }

  async create(organizationId: string, dto: CreateAbsenceDto) {
    await this.ensureEmployee(organizationId, dto.employeeId);
    const start = this.parseDateOnly(dto.startDate);
    const end = this.parseDateOnly(dto.endDate);
    if (end < start) {
      throw new BadRequestException("endDate must be >= startDate");
    }
    return this.prisma.absence.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        type: dto.type,
        startDate: start,
        endDate: end,
        note: (dto.note ?? "").trim(),
      },
      include: { employee: true },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateAbsenceDto) {
    const existing = await this.getOne(organizationId, id);
    if (dto.employeeId != null) {
      await this.ensureEmployee(organizationId, dto.employeeId);
    }
    const start =
      dto.startDate != null
        ? this.parseDateOnly(dto.startDate)
        : existing.startDate;
    const end =
      dto.endDate != null ? this.parseDateOnly(dto.endDate) : existing.endDate;
    if (end < start) {
      throw new BadRequestException("endDate must be >= startDate");
    }
    return this.prisma.absence.update({
      where: { id },
      data: {
        ...(dto.employeeId != null ? { employeeId: dto.employeeId } : {}),
        ...(dto.type != null ? { type: dto.type } : {}),
        ...(dto.startDate != null ? { startDate: start } : {}),
        ...(dto.endDate != null ? { endDate: end } : {}),
        ...(dto.note != null ? { note: dto.note.trim() } : {}),
      },
      include: { employee: true },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.getOne(organizationId, id);
    await this.prisma.absence.delete({ where: { id } });
  }

  /**
   * (Средняя ЗП за 12 мес. / 30.4) × дни — по ТЗ v2.0.
   * Средняя месячная = сумма gross по проведённым расчётам за 12 мес. / число таких месяцев.
   */
  async calculateVacationPay(
    organizationId: string,
    employeeId: string,
    vacationStart: string,
    vacationEnd: string,
  ) {
    await this.ensureEmployee(organizationId, employeeId);
    const vStart = this.parseDateOnly(vacationStart);
    const vEnd = this.parseDateOnly(vacationEnd);
    if (vEnd < vStart) {
      throw new BadRequestException("vacationEnd must be >= vacationStart");
    }
    const calendarDays = daysInclusiveUtc(vStart, vEnd);

    const { startKey, endKey } = vacationPayLookbackYmBounds(vStart);

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
    if (nMonths === 0) {
      throw new BadRequestException(
        "Нет проведённых расчётных листов за 12 месяцев, предшествующих отпуску",
      );
    }

    const avgMonthly = totalGross.div(nMonths);
    const dailyRate = avgMonthly.div(30.4);
    const amount = roundMoney2(dailyRate.mul(calendarDays));

    return {
      employeeId,
      vacationStart: vacationStart.slice(0, 10),
      vacationEnd: vacationEnd.slice(0, 10),
      calendarDays,
      monthsInAverage: nMonths,
      totalGrossInWindow: totalGross.toFixed(4),
      averageMonthlyGross: roundMoney2(avgMonthly).toFixed(4),
      averageDailyGross: roundMoney2(dailyRate).toFixed(4),
      vacationPayAmount: amount.toFixed(4),
      lookbackStartYm: String(startKey),
      lookbackEndYm: String(endKey),
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

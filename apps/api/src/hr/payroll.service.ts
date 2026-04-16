import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Decimal,
  EmployeeKind,
  PayrollRunStatus,
} from "@dayday/database";
import { AccountingService } from "../accounting/accounting.service";
import {
  PAYROLL_EXPENSE_ACCOUNT_CODE,
  PAYROLL_PAYABLE_ACCOUNT_CODE,
  PAYROLL_TAX_PAYABLE_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import { PayrollHeavyQueueService } from "./payroll-heavy.queue";
import { AbsencesService } from "./absences.service";
import type { SickPayCalcDto } from "./dto/sick-pay-calc.dto";
import { TimesheetService } from "./timesheet.service";
import { PAYROLL_ENTITY_ASYNC_THRESHOLD } from "./payroll.constants";
import {
  calculateContractorMicroPayroll,
  calculatePrivateNonOilPayroll,
} from "./payroll-calculator";

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly payrollQueue: PayrollHeavyQueueService,
    private readonly timesheet: TimesheetService,
    private readonly absences: AbsencesService,
  ) {}

  listRuns(organizationId: string) {
    return this.prisma.payrollRun.findMany({
      where: { organizationId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { _count: { select: { slips: true } } },
    });
  }

  async getRun(organizationId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, organizationId },
      include: {
        slips: { include: { employee: true } },
      },
    });
    if (!run) throw new NotFoundException("Payroll run not found");
    return run;
  }

  /**
   * Синхронное создание черновика (используется worker’ом и при N ≤ порога).
   */
  async createDraftRunSync(organizationId: string, dto: CreatePayrollRunDto) {
    const existing = await this.prisma.payrollRun.findUnique({
      where: {
        organizationId_year_month: {
          organizationId,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (existing) {
      throw new ConflictException("Payroll run already exists for this month");
    }

    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
    });
    if (employees.length === 0) {
      throw new BadRequestException("No employees to pay");
    }

    let tsSummary: Awaited<
      ReturnType<TimesheetService["summarizeForPayroll"]>
    > | null = null;
    if (dto.timesheetId) {
      tsSummary = await this.timesheet.summarizeForPayroll(
        dto.timesheetId,
        organizationId,
      );
      if (tsSummary.year !== dto.year || tsSummary.month !== dto.month) {
        throw new BadRequestException(
          "Табель не соответствует выбранному месяцу ведомости",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          organizationId,
          year: dto.year,
          month: dto.month,
          status: PayrollRunStatus.DRAFT,
          timesheetId: dto.timesheetId ?? undefined,
        },
      });

      for (const emp of employees) {
        let grossBase = new Decimal(emp.salary);
        if (
          emp.kind === EmployeeKind.EMPLOYEE &&
          tsSummary?.mixByEmployeeId[emp.id]
        ) {
          const m = tsSummary.mixByEmployeeId[emp.id];
          grossBase = await this.absences.adjustGrossForStampedTimesheetMonth(
            organizationId,
            emp.id,
            grossBase,
            tsSummary.year,
            tsSummary.month,
            m,
          );
        }
        const b =
          emp.kind === EmployeeKind.CONTRACTOR
            ? calculateContractorMicroPayroll(
                new Decimal(emp.salary),
                emp.contractorMonthlySocialAzn,
              )
            : calculatePrivateNonOilPayroll(grossBase);
        if (b.net.isNegative()) {
          throw new BadRequestException(
            `Отрицательная сумма к выплате для сотрудника ${emp.lastName}: проверьте оклад и фикс. соц. удержания`,
          );
        }
        const ts = tsSummary?.byEmployeeId[emp.id];
        await tx.payrollSlip.create({
          data: {
            organizationId,
            payrollRunId: run.id,
            employeeId: emp.id,
            gross: b.gross,
            incomeTax: b.incomeTax,
            dsmfWorker: b.dsmfWorker,
            dsmfEmployer: b.dsmfEmployer,
            itsWorker: b.itsWorker,
            itsEmployer: b.itsEmployer,
            unemploymentWorker: b.unemploymentWorker,
            unemploymentEmployer: b.unemploymentEmployer,
            contractorSocialWithheld: b.contractorSocialWithheld,
            net: b.net,
            timesheetWorkDays: ts?.work ?? null,
            timesheetVacationDays: ts?.vacation ?? null,
            timesheetSickDays: ts?.sick ?? null,
            timesheetBusinessTripDays: ts?.businessTrip ?? null,
          },
        });
      }

      return tx.payrollRun.findUniqueOrThrow({
        where: { id: run.id },
        include: {
          slips: { include: { employee: true } },
        },
      });
    });
  }

  /**
   * При большом числе сотрудников — очередь BullMQ, иначе синхронно.
   */
  async createDraftRun(
    organizationId: string,
    dto: CreatePayrollRunDto,
  ): Promise<
    | { async: true; jobId: string }
    | Awaited<ReturnType<PayrollService["createDraftRunSync"]>>
  > {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      select: { id: true },
    });
    if (employees.length > PAYROLL_ENTITY_ASYNC_THRESHOLD) {
      const jobId = await this.payrollQueue.enqueueDraft(organizationId, dto);
      return { async: true, jobId };
    }
    return this.createDraftRunSync(organizationId, dto);
  }

  async postRunSync(organizationId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: { slips: true },
    });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new ConflictException("Payroll run already posted");
    }
    if (run.slips.length === 0) {
      throw new BadRequestException("No slips");
    }

    let sumGross = new Decimal(0);
    let sumNet = new Decimal(0);
    let sumWorkerTaxes = new Decimal(0);
    let sumEmployer = new Decimal(0);

    for (const s of run.slips) {
      sumGross = sumGross.add(s.gross);
      sumNet = sumNet.add(s.net);
      sumWorkerTaxes = sumWorkerTaxes
        .add(s.incomeTax)
        .add(s.dsmfWorker)
        .add(s.itsWorker)
        .add(s.unemploymentWorker)
        .add(s.contractorSocialWithheld);
      sumEmployer = sumEmployer
        .add(s.dsmfEmployer)
        .add(s.itsEmployer)
        .add(s.unemploymentEmployer);
    }

    const ref = `PAY-${run.year}-${String(run.month).padStart(2, "0")}`;
    const periodEnd = new Date(
      Date.UTC(run.year, run.month, 0, 12, 0, 0, 0),
    );

    const cr521 = sumWorkerTaxes.add(sumEmployer);

    await this.prisma.$transaction(async (tx) => {
      const { transactionId } = await this.accounting.postJournalInTransaction(
        tx,
        {
          organizationId,
          date: periodEnd,
          reference: ref,
          description: `Зарплата ${run.month}/${run.year}`,
          isFinal: true,
          lines: [
            {
              accountCode: PAYROLL_EXPENSE_ACCOUNT_CODE,
              debit: sumGross.toString(),
              credit: 0,
            },
            {
              accountCode: PAYROLL_EXPENSE_ACCOUNT_CODE,
              debit: sumEmployer.toString(),
              credit: 0,
            },
            {
              accountCode: PAYROLL_PAYABLE_ACCOUNT_CODE,
              debit: 0,
              credit: sumNet.toString(),
            },
            {
              accountCode: PAYROLL_TAX_PAYABLE_ACCOUNT_CODE,
              debit: 0,
              credit: cr521.toString(),
            },
          ],
        },
      );

      await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollRunStatus.POSTED,
          transactionId,
        },
      });
    });

    return this.getRun(organizationId, run.id);
  }

  /**
   * При большом числе листов — очередь BullMQ.
   */
  async postRun(
    organizationId: string,
    runId: string,
  ): Promise<
    | { async: true; jobId: string }
    | Awaited<ReturnType<PayrollService["postRunSync"]>>
  > {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: { _count: { select: { slips: true } } },
    });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run._count.slips > PAYROLL_ENTITY_ASYNC_THRESHOLD) {
      const jobId = await this.payrollQueue.enqueuePost(organizationId, runId);
      return { async: true, jobId };
    }
    return this.postRunSync(organizationId, runId);
  }

  /**
   * TZ §7.0: xəstəlik üzrə işəgötürən hissəsi (14 günədək, staj %) — tam məntiqi `AbsencesService`.
   */
  previewSickLeavePay(organizationId: string, dto: SickPayCalcDto) {
    return this.absences.calculateSickPay(organizationId, dto);
  }

  /**
   * TZ §7.0: əmək məzuniyyəti / 30.4 — tam məntiqi `AbsencesService`.
   */
  previewLaborLeavePay(
    organizationId: string,
    employeeId: string,
    vacationStart: string,
    vacationEnd: string,
    absenceTypeId?: string,
  ) {
    return this.absences.calculateVacationPay(
      organizationId,
      employeeId,
      vacationStart,
      vacationEnd,
      absenceTypeId,
    );
  }
}

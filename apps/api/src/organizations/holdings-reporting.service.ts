import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Decimal, LedgerType } from "@dayday/database";
import { AccessControlService } from "../access/access-control.service";
import { CurrencyConverterService } from "../fx/currency-converter.service";
import { CbarExternalFetchDisabledError } from "../fx/cbar-fx.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReportingService } from "../reporting/reporting.service";
import { parseIsoDateOnly } from "../reporting/reporting-period.util";
import { runWithTenantContextAsync } from "../prisma/tenant-context";

@Injectable()
export class HoldingsReportingService {
  private readonly logger = new Logger(HoldingsReportingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly reporting: ReportingService,
    private readonly currency: CurrencyConverterService,
  ) {}

  /**
   * Holding dashboard summary:
   * - aggregated Cash/Bank (101+221) in holding base currency (default AZN)
   * - per-organization cash/bank in org currency + converted value
   */
  async getHoldingSummary(
    userId: string,
    holdingId: string,
    params?: { asOf?: string; ledgerType?: LedgerType },
  ) {
    await this.access.assertMayViewHoldingReports(userId, holdingId);
    const holding = await this.prisma.holding.findFirst({
      where: { id: holdingId, isDeleted: false },
      include: { organizations: { where: { isDeleted: false } } },
    });
    if (!holding) {
      throw new NotFoundException(`Holding with ID ${holdingId} not found`);
    }

    const baseCur = (holding.baseCurrency ?? "AZN").toUpperCase();
    const ledgerType = params?.ledgerType ?? LedgerType.NAS;
    let asOfDate: Date;
    try {
      asOfDate = params?.asOf ? parseIsoDateOnly(params.asOf) : new Date();
    } catch {
      asOfDate = new Date();
    }

    let fxNote: string | null = null;
    let totalCashBankInBase = new Decimal(0);
    const organizations: Array<{
      organizationId: string;
      organizationName: string;
      taxId: string;
      currency: string;
      cashBankBalance: string;
      cashBankInHoldingBase: string | null;
    }> = [];

    for (const org of holding.organizations) {
      const cur = (org.currency ?? "AZN").toUpperCase();
      const dash = await runWithTenantContextAsync(
        { organizationId: org.id, skipTenantFilter: false },
        () => this.reporting.dashboard(org.id, ledgerType),
      );
      const cash = new Decimal(dash.cashBankBalance);
      const row = {
        organizationId: org.id,
        organizationName: org.name,
        taxId: org.taxId,
        currency: cur,
        cashBankBalance: cash.toFixed(4),
        cashBankInHoldingBase: null as string | null,
      };
      try {
        const inBaseRaw = await this.currency.convert(cash, cur, baseCur, asOfDate);
        // Round per-row before summing to keep widget total equal to SUM(table rows).
        const inBaseRounded = new Decimal(inBaseRaw.toFixed(4));
        totalCashBankInBase = totalCashBankInBase.add(inBaseRounded);
        row.cashBankInHoldingBase = inBaseRounded.toFixed(4);
      } catch (e) {
        if (e instanceof CbarExternalFetchDisabledError) {
          fxNote =
            "Курсы ЦБА недоступны (TAX_LOOKUP_MOCK / офлайн): конвертация в базовую валюту не выполнена.";
          row.cashBankInHoldingBase = null;
          this.logger.warn(
            `Holding summary FX disabled: org=${org.id} ${cur}->${baseCur} asOf=${asOfDate.toISOString().slice(0, 10)}`,
          );
        } else {
          // Do not zero out the company; keep raw org currency amount and log the conversion failure.
          this.logger.warn(
            `Holding summary FX failed: org=${org.id} ${cur}->${baseCur} asOf=${asOfDate.toISOString().slice(0, 10)}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          row.cashBankInHoldingBase = null;
        }
      }
      organizations.push(row);
    }

    return {
      holdingId: holding.id,
      holdingName: holding.name,
      holdingBaseCurrency: baseCur,
      fxAsOfDate: asOfDate.toISOString().slice(0, 10),
      totalCashBankInHoldingBase: fxNote ? null : totalCashBankInBase.toFixed(4),
      organizations,
      consolidationNote: fxNote,
    };
  }

  /**
   * Сводный отчёт: P&L по каждой организации холдинга + суммы чистой прибыли по валютам
   * и в **базовой валюте холдинга** (`Holding.baseCurrency`) по курсу ЦБА на `dateTo` (PRD §1.1).
   */
  async consolidatedProfitAndLoss(
    userId: string,
    holdingId: string,
    dateFrom: string,
    dateTo: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    await this.access.assertMayViewHoldingReports(userId, holdingId);
    const holding = await this.prisma.holding.findFirst({
      where: { id: holdingId, isDeleted: false },
      include: { organizations: { where: { isDeleted: false } } },
    });
    if (!holding) {
      throw new NotFoundException(`Holding with ID ${holdingId} not found`);
    }

    const baseCur = (holding.baseCurrency ?? "AZN").toUpperCase();
    let asOf: Date;
    try {
      asOf = parseIsoDateOnly(dateTo);
    } catch {
      asOf = new Date();
    }

    const organizations = [];
    const totalsByCurrency = new Map<string, Decimal>();
    let consolidatedNetProfitInBase = new Decimal(0);
    let fxNote: string | null = null;

    for (const org of holding.organizations) {
      const pnl = await this.reporting.profitAndLoss(
        org.id,
        dateFrom,
        dateTo,
        ledgerType,
        null,
      );
      const np = new Decimal(pnl.netProfit);
      const cur = (org.currency ?? "AZN").toUpperCase();
      organizations.push({
        organizationId: org.id,
        organizationName: org.name,
        taxId: org.taxId,
        currency: cur,
        netProfit: pnl.netProfit,
        netProfitInHoldingBase: null as string | null,
        lines: pnl.lines,
        methodologyNote: pnl.methodologyNote,
        departmentId: pnl.departmentId ?? null,
        payrollExpenseSource: pnl.payrollExpenseSource,
      });
      totalsByCurrency.set(
        cur,
        (totalsByCurrency.get(cur) ?? new Decimal(0)).plus(np),
      );

      try {
        const inBase = await this.currency.convert(np, cur, baseCur, asOf);
        consolidatedNetProfitInBase = consolidatedNetProfitInBase.add(inBase);
        const last = organizations[organizations.length - 1]!;
        last.netProfitInHoldingBase = inBase.toFixed(4);
      } catch (e) {
        if (e instanceof CbarExternalFetchDisabledError) {
          fxNote =
            "Курсы ЦБА недоступны (TAX_LOOKUP_MOCK / офлайн): консолидация в базовую валюту не выполнена.";
          const last = organizations[organizations.length - 1]!;
          last.netProfitInHoldingBase = null;
        } else {
          throw e;
        }
      }
    }

    const consolidatedNetProfitByCurrency: Record<string, string> = {};
    for (const [c, v] of totalsByCurrency) {
      consolidatedNetProfitByCurrency[c] = v.toFixed(4);
    }

    return {
      holdingId: holding.id,
      holdingName: holding.name,
      holdingBaseCurrency: baseCur,
      fxAsOfDate: dateTo,
      dateFrom,
      dateTo,
      ledgerType,
      organizations,
      consolidatedNetProfitByCurrency,
      consolidatedNetProfitInHoldingBase: fxNote
        ? null
        : consolidatedNetProfitInBase.toFixed(4),
      consolidationNote: fxNote,
    };
  }
}

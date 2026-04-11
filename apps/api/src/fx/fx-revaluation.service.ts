import { Injectable, Logger } from "@nestjs/common";
import { AccountType, Decimal, LedgerType } from "@dayday/database";
import { AccountingService } from "../accounting/accounting.service";
import {
  FX_GAIN_ACCOUNT_CODE,
  FX_LOSS_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { CbarRateSyncService } from "./cbar-rate-sync.service";

type FxRevalState = {
  lastPostedMonth?: string;
  /** Валюта → AZN за 1 ед. на момент последнего закрытия */
  rates?: Record<string, number>;
};

function bakuCalendarParts(d: Date): { y: number; m: number; day: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(p.find((x) => x.type === "year")?.value);
  const m = Number(p.find((x) => x.type === "month")?.value);
  const day = Number(p.find((x) => x.type === "day")?.value);
  return { y, m, day };
}

/** Последний день предыдущего календарного месяца (Asia/Baku), UTC 12:00 для @db.Date. */
function previousMonthEndDateUtc(now: Date): Date {
  const { y, m } = bakuCalendarParts(now);
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  const lastDay = new Date(py, pm, 0).getDate();
  return new Date(Date.UTC(py, pm - 1, lastDay, 12, 0, 0, 0));
}

function monthKeyFromParts(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Переоценка остатков по валютным счетам (ASSET, currency ≠ AZN).
 * Остаток трактуется как количество единиц валюты счёта; курсовая разница → 662 / 562.
 */
@Injectable()
export class FxRevaluationService {
  private readonly logger = new Logger(FxRevaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cbarRates: CbarRateSyncService,
    private readonly accounting: AccountingService,
  ) {}

  async runMonthEndForAllOrganizations(now: Date = new Date()): Promise<void> {
    const asOf = previousMonthEndDateUtc(now);
    const { y, m } = bakuCalendarParts(asOf);
    const monthKey = monthKeyFromParts(y, m);

    const orgs = await this.prisma.organization.findMany({
      select: { id: true, settings: true },
    });

    for (const org of orgs) {
      try {
        await this.runForOrganization(org.id, org.settings, asOf, monthKey);
      } catch (e) {
        this.logger.warn(
          `FX reval skip org ${org.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private async runForOrganization(
    organizationId: string,
    settingsJson: unknown,
    asOf: Date,
    monthKey: string,
  ): Promise<void> {
    const settings =
      settingsJson && typeof settingsJson === "object"
        ? (settingsJson as Record<string, unknown>)
        : {};
    const fxRaw = settings.fxRevaluation;
    const fx: FxRevalState =
      fxRaw && typeof fxRaw === "object"
        ? (fxRaw as FxRevalState)
        : {};

    if (fx.lastPostedMonth === monthKey) {
      return;
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        ledgerType: LedgerType.NAS,
        type: AccountType.ASSET,
        NOT: { currency: { in: ["AZN", "AZM", ""] } },
      },
    });
    if (accounts.length === 0) {
      await this.persistFxState(organizationId, settings, fx, monthKey, {});
      return;
    }

    const sums = await this.prisma.journalEntry.groupBy({
      by: ["accountId"],
      where: { organizationId, ledgerType: LedgerType.NAS },
      _sum: { debit: true, credit: true },
    });
    const netByAccount = new Map<string, Decimal>();
    for (const row of sums) {
      const dr = row._sum.debit ?? new Decimal(0);
      const cr = row._sum.credit ?? new Decimal(0);
      netByAccount.set(row.accountId, dr.sub(cr));
    }

    const oldRates: Record<string, number> = { ...(fx.rates ?? {}) };
    const newRates: Record<string, number> = { ...oldRates };

    const lines: { accountCode: string; debit: string; credit: string }[] = [];
    const EPS = new Decimal("0.01");

    for (const acc of accounts) {
      const ccy = acc.currency.trim().toUpperCase();
      if (!ccy || ccy === "AZN" || ccy === "AZM") continue;

      const balance = netByAccount.get(acc.id) ?? new Decimal(0);
      if (balance.abs().lte(EPS)) continue;

      let newRate: number;
      try {
        newRate = await this.cbarRates.getFinalOfficialAznPerUnit(ccy, asOf);
      } catch {
        this.logger.debug(
          `FX reval: пропуск ${ccy} — нет FINAL курса ЦБА на дату закрытия`,
        );
        continue;
      }
      newRates[ccy] = newRate;

      const oldRate = oldRates[ccy] ?? newRate;
      const diff = balance.mul(new Decimal(newRate - oldRate));
      if (diff.abs().lte(EPS)) continue;

      if (diff.gt(0)) {
        lines.push({
          accountCode: acc.code,
          debit: diff.abs().toString(),
          credit: "0",
        });
        lines.push({
          accountCode: FX_GAIN_ACCOUNT_CODE,
          debit: "0",
          credit: diff.abs().toString(),
        });
      } else {
        const amt = diff.abs().toString();
        lines.push({
          accountCode: FX_LOSS_ACCOUNT_CODE,
          debit: amt,
          credit: "0",
        });
        lines.push({
          accountCode: acc.code,
          debit: "0",
          credit: amt,
        });
      }
    }

    if (lines.length > 0) {
      await this.accounting.postTransaction({
        organizationId,
        date: asOf,
        reference: `FX-${monthKey}`,
        description: `Курсовая разница (закрытие ${monthKey})`,
        lines,
      });
    }

    await this.persistFxState(organizationId, settings, fx, monthKey, newRates);
  }

  private async persistFxState(
    organizationId: string,
    base: Record<string, unknown>,
    fx: FxRevalState,
    monthKey: string,
    rates: Record<string, number>,
  ): Promise<void> {
    const next = {
      ...base,
      fxRevaluation: {
        ...fx,
        lastPostedMonth: monthKey,
        rates: { ...(fx.rates ?? {}), ...rates },
      },
    };
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as object },
    });
  }
}

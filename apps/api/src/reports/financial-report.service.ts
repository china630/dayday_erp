import { Injectable } from "@nestjs/common";
import { AccountType, LedgerType, Prisma } from "@dayday/database";
import { ReportingService } from "../reporting/reporting.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsCacheService } from "./reports-cache.service";

type DecimalLike = Prisma.Decimal | number | string;
type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

function d(v: DecimalLike | null | undefined): Prisma.Decimal {
  return new Decimal(v ?? 0);
}

function utcDateOnlyStr(s: string): string {
  return s.slice(0, 10);
}

@Injectable()
export class FinancialReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporting: ReportingService,
    private readonly cache: ReportsCacheService,
  ) {}

  async generateBalanceSheet(
    organizationId: string,
    asOfDate: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ): Promise<{
    asOfDate: string;
    ledgerType: LedgerType;
    assets: Array<{ code: string; name: string; amount: string }>;
    liabilities: Array<{ code: string; name: string; amount: string }>;
    equity: Array<{ code: string; name: string; amount: string }>;
    totals: { assets: string; liabilities: string; equity: string; liabilitiesEquity: string };
    cached?: boolean;
    journalEntryCount: number;
  }> {
    const dateTo = utcDateOnlyStr(asOfDate);
    const cacheKey = `reports:bs:${organizationId}:${ledgerType}:${dateTo}`;

    const journalEntryCount = await this.prisma.journalEntry.count({
      where: {
        organizationId,
        ledgerType,
        transaction: {
          date: { lte: new Date(`${dateTo}T23:59:59.999Z`) },
        },
      },
    });

    if (journalEntryCount > 1000) {
      const cached = await this.cache.getJson<
        Awaited<ReturnType<FinancialReportService["generateBalanceSheet"]>>
      >(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const tb = await this.reporting.trialBalance(
      organizationId,
      "1970-01-01",
      dateTo,
      ledgerType,
    );

    const sumByPrefix = (prefixes: string[]): Prisma.Decimal => {
      let sum = new Decimal(0);
      for (const r of tb.rows) {
        if (!prefixes.some((p) => r.accountCode.startsWith(p))) continue;
        const net = d(r.closingDebit).sub(d(r.closingCredit));
        // assets are positive as net; for liability/equity codes this might be negative; keep sign and normalize later.
        sum = sum.add(net);
      }
      return sum;
    };

    const assetsRows = [
      { code: "CASH", name: "Cash & Bank", amount: sumByPrefix(["101", "221", "223"]) },
      { code: "AR", name: "Receivables (211)", amount: sumByPrefix(["211"]) },
      { code: "INV", name: "Inventory (201/204)", amount: sumByPrefix(["201", "204"]) },
    ];

    const liabilitiesRows = [
      // liabilities have credit balances → represent as positive
      { code: "AP", name: "Payables (531)", amount: sumByPrefix(["531"]).neg() },
      { code: "PAY_TAX", name: "Payroll & Taxes (521/523)", amount: sumByPrefix(["521", "523"]).neg() },
    ];

    // Equity: use TB equity accounts if present, else compute as Assets - Liabilities.
    let eqTotal = new Decimal(0);
    for (const r of tb.rows) {
      if (r.accountType !== AccountType.EQUITY) continue;
      const net = d(r.closingDebit).sub(d(r.closingCredit));
      eqTotal = eqTotal.add(net.neg());
    }

    const assetsTotal = assetsRows.reduce((a, x) => a.add(x.amount), new Decimal(0));
    const liabilitiesTotal = liabilitiesRows.reduce((a, x) => a.add(x.amount), new Decimal(0));
    if (eqTotal.eq(0)) {
      eqTotal = assetsTotal.sub(liabilitiesTotal);
    }

    const charterCapital = (() => {
      // common equity codes in AR chart: 301.*
      let sum = new Decimal(0);
      for (const r of tb.rows) {
        if (!r.accountCode.startsWith("301")) continue;
        const net = d(r.closingDebit).sub(d(r.closingCredit));
        sum = sum.add(net.neg());
      }
      return sum;
    })();

    const retained = eqTotal.sub(charterCapital);

    const equityRows = [
      { code: "CAP", name: "Charter capital (301)", amount: charterCapital },
      { code: "RE", name: "Retained earnings / result", amount: retained },
    ];

    const result = {
      asOfDate: dateTo,
      ledgerType,
      assets: assetsRows.map((x) => ({ ...x, amount: x.amount.toFixed(2) })),
      liabilities: liabilitiesRows.map((x) => ({ ...x, amount: x.amount.toFixed(2) })),
      equity: equityRows.map((x) => ({ ...x, amount: x.amount.toFixed(2) })),
      totals: {
        assets: assetsTotal.toFixed(2),
        liabilities: liabilitiesTotal.toFixed(2),
        equity: eqTotal.toFixed(2),
        liabilitiesEquity: liabilitiesTotal.add(eqTotal).toFixed(2),
      },
      journalEntryCount,
    };

    if (journalEntryCount > 1000) {
      await this.cache.setJson(cacheKey, result, 60 * 10);
    }

    return result;
  }

  async executiveWidgets(
    organizationId: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ): Promise<{
    ledgerType: LedgerType;
    periodLabel: string;
    totalCash: string;
    receivables: string;
    /** Trade payables: account 531 only (vendors). */
    vendorPayables: string;
    /** Payroll & tax liabilities: accounts 521 + 523. */
    salariesAndTaxesPayables: string;
    netProfitMtd: string;
  }> {
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dateFromStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const dateToStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const [pl, bs] = await Promise.all([
      this.reporting.profitAndLoss(organizationId, dateFromStr, dateToStr, ledgerType),
      this.generateBalanceSheet(organizationId, dateToStr, ledgerType),
    ]);

    const totalCash = bs.assets.find((x) => x.code === "CASH")?.amount ?? "0.00";
    const receivables = bs.assets.find((x) => x.code === "AR")?.amount ?? "0.00";
    const vendorPayables =
      bs.liabilities.find((x) => x.code === "AP")?.amount ?? "0.00";
    const salariesAndTaxesPayables =
      bs.liabilities.find((x) => x.code === "PAY_TAX")?.amount ?? "0.00";

    return {
      ledgerType,
      periodLabel: `${y}-${String(m).padStart(2, "0")}`,
      totalCash,
      receivables,
      vendorPayables,
      salariesAndTaxesPayables,
      netProfitMtd: String(pl.netProfit ?? "0"),
    };
  }
}

